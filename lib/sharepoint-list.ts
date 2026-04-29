/**
 * Microsoft Graph → SharePoint List (app-only / client credentials).
 * Vereist: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 * Graph: Sites.Read.All (application)
 *
 * Contactmomenten acquisitie lijst:
 * https://dynamoretailgroup.sharepoint.com/sites/AcquisitieNederland/Lists/Contactmomenten%20acquisitie/AllItems.aspx
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_URL = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

/** Sharepoint site-ID en lijst-ID (geëxtraheerd uit URL) */
const SHAREPOINT_CONFIG = {
  tenant: 'dynamoretailgroup.onmicrosoft.com',
  site: 'AcquisitieNederland',
  listName: 'Contactmomenten acquisitie',
}

function formatSharepoint403Help(technical: string): string {
  return [
    'Microsoft weigerde toegang tot SharePoint-lijst (403). Controleer in Entra ID:',
    '• API-machtigingen → Microsoft Graph → Application (niet alleen Delegated): Sites.Read.All',
    '• Knop "Grant admin consent for [organisatie]" voor de app (Global Admin / Cloud App Admin).',
    '• AZURE_TENANT_ID = Directory (tenant) ID.',
    '• SharePoint site is beschikbaar: https://dynamoretailgroup.sharepoint.com/sites/AcquisitieNederland',
    '',
    `Technisch: ${technical.slice(0, 600)}${technical.length > 600 ? '…' : ''}`,
  ].join('\n')
}

export function isSharepointConfigured(): boolean {
  const t = process.env.AZURE_TENANT_ID?.trim()
  const c = process.env.AZURE_CLIENT_ID?.trim()
  const s = process.env.AZURE_CLIENT_SECRET?.trim()
  return !!(t && c && s)
}

export type SharepointListItem = {
  id: string
  fields: Record<string, any>
  [key: string]: any
}

async function fetchAccessToken(): Promise<string> {
  const tenant = process.env.AZURE_TENANT_ID?.trim()
  const clientId = process.env.AZURE_CLIENT_ID?.trim()
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim()
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('SharePoint niet geconfigureerd: zet AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET.')
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
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Token-fout: ${res.status}`)

  const json = (await res.json()) as { access_token?: string; error?: string }
  if (!json.access_token) throw new Error('Geen access_token van Microsoft.')
  return json.access_token
}

/**
 * Haal alle items uit SharePoint-lijst op (met paginatie).
 * Retourneert array van items met hun `fields` (kolommen).
 */
export async function fetchSharepointListItems(): Promise<SharepointListItem[]> {
  if (!isSharepointConfigured()) {
    console.warn('SharePoint niet geconfigureerd. Retourneer lege array.')
    return []
  }

  try {
    const token = await fetchAccessToken()

    // 1. Vind de site-ID van AcquisitieNederland
    const siteSearchUrl = `${GRAPH_BASE}/sites?search=${encodeURIComponent(SHAREPOINT_CONFIG.site)}`
    const siteRes = await fetch(siteSearchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!siteRes.ok) {
      const err = await siteRes.text()
      throw new Error(
        formatSharepoint403Help(`Site zoeken ${siteRes.status}: ${err}`),
      )
    }

    const siteJson = (await siteRes.json()) as { value?: Array<{ id: string }> }
    const siteId = siteJson.value?.[0]?.id
    if (!siteId) throw new Error('SharePoint-site AcquisitieNederland niet gevonden.')

    // 2. Vind de lijst-ID van "Contactmomenten acquisitie"
    const listSearchUrl = `${GRAPH_BASE}/sites/${siteId}/lists?$filter=displayName eq '${encodeURIComponent(SHAREPOINT_CONFIG.listName)}'`
    const listRes = await fetch(listSearchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok) {
      const err = await listRes.text()
      throw new Error(
        formatSharepoint403Help(`Lijst zoeken ${listRes.status}: ${err}`),
      )
    }

    const listJson = (await listRes.json()) as { value?: Array<{ id: string }> }
    const listId = listJson.value?.[0]?.id
    if (!listId) throw new Error(`SharePoint-lijst "${SHAREPOINT_CONFIG.listName}" niet gevonden.`)

    // 3. Haal alle items op (met paginatie)
    const out: SharepointListItem[] = []
    let nextUrl = `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=100`

    while (nextUrl) {
      const itemRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!itemRes.ok) {
        const err = await itemRes.text()
        throw new Error(
          formatSharepoint403Help(`Items ophalen ${itemRes.status}: ${err}`),
        )
      }

      const itemJson = (await itemRes.json()) as {
        value?: SharepointListItem[]
        '@odata.nextLink'?: string
      }
      if (itemJson.value) out.push(...itemJson.value)

      nextUrl = itemJson['@odata.nextLink'] ?? ''
    }

    return out
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('SharePoint-fout:', msg)
    throw err
  }
}

/**
 * Transformeer SharePoint-items naar een gesorteerde, gefilterde array.
 */
export function transformListItems(
  items: SharepointListItem[],
): Array<{
  id: string
  [key: string]: any
}> {
  return items.map(item => ({
    id: item.id,
    ...item.fields,
  }))
}
