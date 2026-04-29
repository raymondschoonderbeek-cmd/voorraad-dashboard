/**
 * Microsoft Graph → SharePoint List (app-only / client credentials).
 * Vereist: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 * Graph: Sites.Read.All (application)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const TOKEN_URL = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

const SHAREPOINT_CONFIG = {
  tenant: 'dynamoretailgroup.onmicrosoft.com',
  site: 'AcquisitieNederland',
  listName: 'Contactmomenten NL',
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

type WinkelInfo = { naam: string; woonplaats: string }

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

  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('Geen access_token van Microsoft.')
  return json.access_token
}

/** Alle pagina's van een Graph-lijst ophalen. */
async function fetchAllPages(startUrl: string, token: string): Promise<any[]> {
  const out: any[] = []
  let nextUrl = startUrl
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(formatSharepoint403Help(`${res.status}: ${err}`))
    }
    const json = (await res.json()) as { value?: any[]; '@odata.nextLink'?: string }
    if (json.value) out.push(...json.value)
    nextUrl = json['@odata.nextLink'] ?? ''
  }
  return out
}

/**
 * Zoek het listId van de Winkel-lookup via de kolomdefinitie van de hoofdlijst,
 * haal dan alle Winkel-items op en bouw een Map id → {naam, woonplaats}.
 * Retourneert null als de lookup niet gevonden of niet op te halen is (non-fatal).
 */
async function fetchWinkelMap(
  token: string,
  siteId: string,
  listId: string,
): Promise<Map<string, WinkelInfo> | null> {
  try {
    // Kolommen van de hoofdlijst ophalen om de Winkel-lookup listId te vinden
    const colRes = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists/${listId}/columns`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!colRes.ok) {
      console.error(`Winkel-lookup: columns ophalen mislukt (${colRes.status})`)
      return null
    }

    const colJson = (await colRes.json()) as { value?: Array<{ name: string; lookup?: { listId: string } }> }
    const winkelKolom = colJson.value?.find(c => c.name === 'Winkel')
    console.log('Winkel-kolom gevonden:', JSON.stringify(winkelKolom ?? null))

    const winkelListId = winkelKolom?.lookup?.listId
    if (!winkelListId) {
      console.error('Winkel-lookup: geen listId in kolomdefinitie')
      return null
    }
    console.log('Winkel-listId:', winkelListId)

    // Probeer de Winkel-items op te halen; de lijst kan op dezelfde of een andere site staan
    let winkels: any[] = []
    try {
      winkels = await fetchAllPages(
        `${GRAPH_BASE}/sites/${siteId}/lists/${winkelListId}/items?$expand=fields&$top=500`,
        token,
      )
    } catch (e) {
      // Fallback: probeer via root-site
      console.warn('Winkel-lookup op huidige site mislukt, probeer root-site:', e instanceof Error ? e.message : String(e))
      const rootSiteRes = await fetch(`${GRAPH_BASE}/sites/dynamoretailgroup.sharepoint.com`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (rootSiteRes.ok) {
        const rootJson = (await rootSiteRes.json()) as { id?: string }
        const rootSiteId = rootJson.id
        if (rootSiteId) {
          winkels = await fetchAllPages(
            `${GRAPH_BASE}/sites/${rootSiteId}/lists/${winkelListId}/items?$expand=fields&$top=500`,
            token,
          )
        }
      }
    }

    console.log(`Winkel-map: ${winkels.length} items opgehaald`)
    if (winkels.length > 0) {
      console.log('Eerste Winkel-item fields:', JSON.stringify(winkels[0]?.fields ?? {}))
    }

    const map = new Map<string, WinkelInfo>()
    for (const w of winkels) {
      const f = w.fields as Record<string, any>
      map.set(String(w.id), {
        naam: f?.NAAM ?? f?.Naam ?? f?.Title ?? '',
        woonplaats: f?.WOONPLAATS ?? f?.Woonplaats ?? f?.Plaats ?? '',
      })
    }
    return map.size > 0 ? map : null
  } catch (e) {
    console.error('Winkel-lookup mislukt:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/**
 * Haal alle Contactmomenten-items op en verrijk ze met winkel-naam en -woonplaats.
 */
export async function fetchSharepointListItems(): Promise<{
  items: SharepointListItem[]
  winkelMap: Map<string, WinkelInfo> | null
}> {
  if (!isSharepointConfigured()) {
    console.warn('SharePoint niet geconfigureerd. Retourneer lege array.')
    return { items: [], winkelMap: null }
  }

  try {
    const token = await fetchAccessToken()

    // 1. Site-ID
    const siteSearchUrl = `${GRAPH_BASE}/sites?search=${encodeURIComponent(SHAREPOINT_CONFIG.site)}`
    const siteRes = await fetch(siteSearchUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!siteRes.ok) {
      const err = await siteRes.text()
      throw new Error(formatSharepoint403Help(`Site zoeken ${siteRes.status}: ${err}`))
    }
    const siteJson = (await siteRes.json()) as { value?: Array<{ id: string }> }
    const siteId = siteJson.value?.[0]?.id
    if (!siteId) throw new Error('SharePoint-site AcquisitieNederland niet gevonden.')

    // 2. Lijst-ID van "Contactmomenten NL"
    const listParams = new URLSearchParams({ '$filter': `displayName eq '${SHAREPOINT_CONFIG.listName}'` })
    const listRes = await fetch(`${GRAPH_BASE}/sites/${siteId}/lists?${listParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!listRes.ok) {
      const err = await listRes.text()
      throw new Error(formatSharepoint403Help(`Lijst zoeken ${listRes.status}: ${err}`))
    }
    const listJson = (await listRes.json()) as { value?: Array<{ id: string }> }
    const listId = listJson.value?.[0]?.id
    if (!listId) throw new Error(`SharePoint-lijst "${SHAREPOINT_CONFIG.listName}" niet gevonden.`)

    // 3. Contactmomenten + Winkel-map parallel ophalen
    const [items, winkelMap] = await Promise.all([
      fetchAllPages(
        `${GRAPH_BASE}/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=100`,
        token,
      ),
      fetchWinkelMap(token, siteId, listId),
    ])

    return { items, winkelMap }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('SharePoint-fout:', msg)
    throw err
  }
}

// Systeem- en dubbele velden verbergen
const SKIP_VELDEN_BASIS = new Set([
  '@odata.etag', 'ContentType', 'AuthorLookupId', 'EditorLookupId',
  '_UIVersionString', 'Attachments', 'Edit', 'ItemChildCount', 'FolderChildCount',
  '_ComplianceFlags', '_ComplianceTag', '_ComplianceTagWrittenTime', '_ComplianceTagUserId',
  'LinkTitleNoMenu', 'LinkTitle',
  'Winkel_x003a__x0020_AanspreekpunLookupId',
  'Winkel_x003a__x0020_Aanspreekpun0LookupId',
  'Winkel_x003a__x0020_Aanspreekpun1LookupId',
  'Winkel_x003a__x0020_NAAMLookupId',
  'Winkel_x003a__x0020_WOONPLAATSLookupId',
])

/**
 * Transformeer SharePoint-items naar een platte array.
 * Als winkelMap beschikbaar is, wordt WinkelLookupId vervangen door naam + woonplaats.
 */
export function transformListItems(
  items: SharepointListItem[],
  winkelMap: Map<string, WinkelInfo> | null,
): Array<{ id: string; [key: string]: any }> {
  const skipVelden = winkelMap
    ? new Set([...SKIP_VELDEN_BASIS, 'WinkelLookupId'])
    : SKIP_VELDEN_BASIS

  return items.map(item => {
    const out: { id: string; [key: string]: any } = { id: item.id }
    const fields = item.fields as Record<string, any>

    // Winkel-naam en woonplaats vooraan toevoegen als lookup beschikbaar is
    if (winkelMap) {
      const winkelId = String(fields.WinkelLookupId ?? '')
      const winkel = winkelMap.get(winkelId)
      out.Winkel = winkel?.naam ?? `#${winkelId}`
      out.Woonplaats = winkel?.woonplaats ?? ''
    }

    for (const [k, v] of Object.entries(fields)) {
      if (!skipVelden.has(k)) out[k] = v
    }
    return out
  })
}
