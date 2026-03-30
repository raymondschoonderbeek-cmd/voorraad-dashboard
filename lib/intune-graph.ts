import type { IntuneSnapshot } from '@/lib/it-cmdb-types'

/**
 * Microsoft Graph → Intune managed devices (app-only / client credentials).
 * Vereist: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 * Graph: DeviceManagementManagedDevices.Read.All (application)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_URL = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

/** Uitleg bij HTTP 403 van Intune/Graph (rechten of tenant). */
function formatIntune403Help(technical: string): string {
  return [
    'Microsoft weigerde toegang tot Intune-apparaten (403). Controleer in Entra ID:',
    '• API-machtigingen → Microsoft Graph → Application (niet alleen Delegated): DeviceManagementManagedDevices.Read.All',
    '• Knop “Grant admin consent for [organisatie]” voor de app (Global Admin / Cloud App Admin).',
    '• AZURE_TENANT_ID = Directory (tenant) ID van de tenant waar Intune actief is.',
    '• Tenant heeft Intune / Endpoint Manager in gebruik (licentie + workload).',
    '',
    `Technisch: ${technical.slice(0, 600)}${technical.length > 600 ? '…' : ''}`,
  ].join('\n')
}

export function isIntuneGraphConfigured(): boolean {
  const t = process.env.AZURE_TENANT_ID?.trim()
  const c = process.env.AZURE_CLIENT_ID?.trim()
  const s = process.env.AZURE_CLIENT_SECRET?.trim()
  return !!(t && c && s)
}

export type GraphManagedDevice = {
  id: string
  serialNumber?: string | null
  deviceName?: string | null
  userPrincipalName?: string | null
  emailAddress?: string | null
  model?: string | null
  manufacturer?: string | null
  complianceState?: string | null
  managementState?: string | null
  lastSyncDateTime?: string | null
}

async function fetchAccessToken(): Promise<string> {
  const tenant = process.env.AZURE_TENANT_ID?.trim()
  const clientId = process.env.AZURE_CLIENT_ID?.trim()
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim()
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('Intune/Graph niet geconfigureerd: zet AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET.')
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const res = await fetch(TOKEN_URL(tenant), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!res.ok) {
    throw new Error(
      json.error_description ?? json.error ?? `Token-aanvraag mislukt (${res.status})`
    )
  }
  if (!json.access_token) throw new Error('Geen access_token van Microsoft.')
  return json.access_token
}

/** Alle managed devices ophalen (paginering). */
export async function fetchAllManagedDevices(): Promise<GraphManagedDevice[]> {
  const token = await fetchAccessToken()
  const select = [
    'id',
    'serialNumber',
    'deviceName',
    'userPrincipalName',
    'emailAddress',
    'model',
    'manufacturer',
    'complianceState',
    'managementState',
    'lastSyncDateTime',
  ].join(',')
  let url: string | null =
    `${GRAPH_BASE}/deviceManagement/managedDevices?$select=${encodeURIComponent(select)}&$top=100`
  const out: GraphManagedDevice[] = []

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = (await res.json()) as {
      value?: GraphManagedDevice[]
      '@odata.nextLink'?: string
      error?: { message?: string; code?: string }
    }
    if (!res.ok) {
      const raw = json.error?.message ?? JSON.stringify(json).slice(0, 1200)
      if (res.status === 403) {
        throw new Error(formatIntune403Help(raw))
      }
      const code = json.error?.code ? ` [${json.error.code}]` : ''
      throw new Error(`${raw}${code}`)
    }
    for (const row of json.value ?? []) {
      out.push(row)
    }
    url = json['@odata.nextLink'] ?? null
  }

  return out
}

function formatIntuneSummary(d: GraphManagedDevice): string {
  const parts: string[] = []
  if (d.complianceState) parts.push(String(d.complianceState))
  if (d.managementState) parts.push(String(d.managementState))
  if (d.lastSyncDateTime) {
    try {
      const dt = new Date(d.lastSyncDateTime)
      if (!Number.isNaN(dt.getTime())) parts.push(`Sync: ${dt.toISOString().slice(0, 10)}`)
    } catch {
      /* ignore */
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Intune'
}

function formatDeviceType(d: GraphManagedDevice): string | null {
  const m = [d.manufacturer, d.model].filter(x => x && String(x).trim()).map(x => String(x).trim())
  return m.length > 0 ? m.join(' ') : null
}

export function buildIntuneSnapshot(d: GraphManagedDevice): IntuneSnapshot {
  return {
    graphDeviceId: d.id,
    complianceState: d.complianceState != null ? String(d.complianceState) : null,
    managementState: d.managementState != null ? String(d.managementState) : null,
    lastSyncDateTime: d.lastSyncDateTime ?? null,
    userPrincipalName: d.userPrincipalName?.trim() || null,
    emailAddress: d.emailAddress?.trim() || null,
    manufacturer: d.manufacturer?.trim() || null,
    model: d.model?.trim() || null,
  }
}

export function mapManagedDeviceToCmdb(d: GraphManagedDevice): {
  serial_number: string
  hostname: string
  intune: string | null
  user_name: string | null
  device_type: string | null
  intune_snapshot: IntuneSnapshot
} {
  const serial = d.serialNumber?.trim()
  if (!serial) throw new Error('Geen serienummer')
  const hostname = (d.deviceName?.trim() || '').slice(0, 2000)
  const user_name = d.userPrincipalName?.trim() || d.emailAddress?.trim() || null
  return {
    serial_number: serial,
    hostname,
    intune: formatIntuneSummary(d),
    user_name,
    device_type: formatDeviceType(d),
    intune_snapshot: buildIntuneSnapshot(d),
  }
}
