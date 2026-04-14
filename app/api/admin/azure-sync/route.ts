import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'

interface GraphManager {
  displayName: string | null
  mail: string | null
  userPrincipalName: string | null
}

interface GraphUser {
  id: string
  displayName: string | null
  mail: string | null
  userPrincipalName: string
  givenName: string | null
  surname: string | null
  jobTitle: string | null
  department: string | null
  accountEnabled: boolean
  userType: string | null
  assignedLicenses: { skuId: string }[]
  manager?: GraphManager | null
}

interface SubscribedSku {
  skuId: string
  skuPartNumber: string
}

export async function getAzureToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'Azure omgevingsvariabelen ontbreken. Voeg AZURE_TENANT_ID, AZURE_CLIENT_ID en AZURE_CLIENT_SECRET toe aan .env.local.'
    )
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error_description?: string }
    throw new Error(`Azure token ophalen mislukt: ${err.error_description ?? res.statusText}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

// E3-gerelateerde SKU part numbers (Microsoft 365 E3 en Office 365 E3)
const E3_SKU_PATTERNS = ['SPE_E3', 'ENTERPRISEPACK', 'ENTERPRISEPREMIUM']

// Bekende SKU IDs die altijd als geldig worden beschouwd (ongeacht skuPartNumber)
const BEKENDE_SKU_IDS = new Set([
  'c2fe850d-fbbb-4858-b67d-bd0c6e746da3', // Dynamo Retail Group tenant licentie
])

async function fetchE3SkuIds(token: string): Promise<Set<string>> {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId,skuPartNumber',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  // Start met de bekende vaste SKU IDs
  const e3Ids = new Set<string>(BEKENDE_SKU_IDS)
  if (!res.ok) return e3Ids
  const data = await res.json() as { value?: SubscribedSku[] }
  for (const sku of data.value ?? []) {
    if (E3_SKU_PATTERNS.some(p => sku.skuPartNumber?.toUpperCase().includes(p))) {
      e3Ids.add(sku.skuId)
    }
  }
  return e3Ids
}

async function fetchAllAzureUsers(token: string): Promise<GraphUser[]> {
  const users: GraphUser[] = []
  // $expand=manager cannot be combined with $filter on the /users collection endpoint
  // Managers are fetched separately after filtering (see fetchManagersForUsers)
  let url: string | null =
    'https://graph.microsoft.com/v1.0/users' +
    '?$select=id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,accountEnabled,userType,assignedLicenses' +
    '&$filter=accountEnabled eq true and userType eq \'Member\'' +
    '&$top=999'

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Graph API fout: ${err.error?.message ?? res.statusText}`)
    }

    const data = await res.json() as { value?: GraphUser[]; '@odata.nextLink'?: string }
    users.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }

  return users
}

// Fetch managers for a list of users in parallel batches of 20
// Returns { gevonden, geenManager, fouten }
async function fetchManagersForUsers(
  token: string,
  users: GraphUser[]
): Promise<{ gevonden: number; geenManager: number; fouten: string[] }> {
  const BATCH = 20
  let gevonden = 0
  let geenManager = 0
  const fouten: string[] = []

  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH)
    await Promise.all(batch.map(async user => {
      try {
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/users/${user.id}/manager?$select=displayName,mail,userPrincipalName`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.status === 404) {
          geenManager++
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: { message?: string; code?: string } }
          fouten.push(`Manager ${user.userPrincipalName}: ${res.status} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`.trim())
          return
        }
        const mgr = await res.json() as { displayName?: string; mail?: string; userPrincipalName?: string }
        user.manager = {
          displayName: mgr.displayName ?? null,
          mail: mgr.mail ?? null,
          userPrincipalName: mgr.userPrincipalName ?? null,
        }
        gevonden++
      } catch (e) {
        fouten.push(`Manager ${user.userPrincipalName}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }))
  }

  return { gevonden, geenManager, fouten }
}

function voldoetAanSyncCriteria(user: GraphUser, e3SkuIds: Set<string>): boolean {
  // 1. userType = Member (al gefilterd in query, maar als extra check)
  if (user.userType !== 'Member') return false

  // 2. accountEnabled = true (al gefilterd in query)
  if (!user.accountEnabled) return false

  // 3. mail of userPrincipalName eindigt op een toegestaan domein
  const mail = (user.mail ?? '').toLowerCase()
  const upn = (user.userPrincipalName ?? '').toLowerCase()
  const toegestaaneDomeinen = ['@dynamoretailgroup.com', '@biketotaallease.com', '@dynamolease.com']
  if (!toegestaaneDomeinen.some(d => mail.endsWith(d) || upn.endsWith(d))) return false

  // 4. Heeft een E3-licentie
  const heeftE3 = (user.assignedLicenses ?? []).some(l => e3SkuIds.has(l.skuId))
  if (!heeftE3) return false

  // 5. department is gevuld
  if (!user.department?.trim()) return false

  return true
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rolData } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()
  if (rolData?.rol !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  let token: string
  try {
    token = await getAzureToken()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  let azureUsers: GraphUser[]
  let e3SkuIds: Set<string>
  try {
    [azureUsers, e3SkuIds] = await Promise.all([
      fetchAllAzureUsers(token),
      fetchE3SkuIds(token),
    ])
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Filteranalyse: tel per criterium hoeveel afvallen
  let filteredDomain = 0, filteredE3 = 0, filteredDept = 0
  const teVerwerken: GraphUser[] = []
  for (const u of azureUsers) {
    if (u.userType !== 'Member' || !u.accountEnabled) continue
    const mail = (u.mail ?? '').toLowerCase()
    const upn = (u.userPrincipalName ?? '').toLowerCase()
    const toegestaaneDomeinen = ['@dynamoretailgroup.com', '@biketotaallease.com', '@dynamolease.com']
    const domeinOk = toegestaaneDomeinen.some(d => mail.endsWith(d) || upn.endsWith(d))
    if (!domeinOk) { filteredDomain++; continue }
    const heeftE3 = (u.assignedLicenses ?? []).some(l => e3SkuIds.has(l.skuId))
    if (!heeftE3) { filteredE3++; continue }
    if (!u.department?.trim()) { filteredDept++; continue }
    teVerwerken.push(u)
  }
  const gefilterd = azureUsers.length - teVerwerken.length

  // Managers ophalen voor gekwalificeerde gebruikers (apart, want $expand+$filter werkt niet samen)
  const managerStats = await fetchManagersForUsers(token, teVerwerken)

  // Haal alle bestaande Supabase-gebruikers op
  const supabaseUsers: { id: string; email: string }[] = []
  let page = 1
  while (true) {
    const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (!batch || batch.length === 0) break
    supabaseUsers.push(...batch.map(u => ({ id: u.id, email: (u.email ?? '').toLowerCase() })))
    if (batch.length < 1000) break
    page++
  }

  const emailToUserId = new Map(supabaseUsers.map(u => [u.email, u.id]))

  // Haal bestaande gebruiker_rollen op
  const { data: bestaandeRollen } = await adminClient.from('gebruiker_rollen').select('user_id')
  const heeftRol = new Set<string>((bestaandeRollen ?? []).map((r: { user_id: string }) => r.user_id))

  let aangemaakt = 0
  let profielGezet = 0
  let managerBijgewerkt = 0
  let overgeslagen = 0
  const fouten: string[] = []

  for (const azUser of teVerwerken) {
    const email = (azUser.mail ?? azUser.userPrincipalName ?? '').toLowerCase().trim()
    if (!email || email.includes('#ext#')) {
      overgeslagen++
      continue
    }

    // Manager info extraheren
    const managerNaam = azUser.manager?.displayName ?? null
    const managerEmail = (azUser.manager?.mail ?? azUser.manager?.userPrincipalName ?? null)?.toLowerCase() ?? null

    let userId = emailToUserId.get(email)

    if (!userId) {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          azure_object_id: azUser.id,
          full_name: azUser.displayName,
          provider: 'azure',
        },
      })

      if (createErr) {
        if (createErr.message?.toLowerCase().includes('already')) {
          overgeslagen++
          continue
        }
        fouten.push(`${email}: ${createErr.message}`)
        continue
      }

      userId = created.user.id
      aangemaakt++
    }

    if (!heeftRol.has(userId)) {
      const naam = azUser.displayName ?? email

      const { error: rolErr } = await adminClient.from('gebruiker_rollen').insert({
        user_id: userId,
        rol: 'viewer',
        naam,
        manager_naam: managerNaam,
        manager_email: managerEmail,
        afdeling: azUser.department?.trim() ?? null,
      })

      if (rolErr) {
        fouten.push(`Profiel ${email}: ${rolErr.message}`)
      } else {
        profielGezet++
        try {
          await adminClient.from('profiles').upsert(
            {
              user_id: userId,
              modules_toegang: ['voorraad', 'brand-groep', 'branche-nieuws', 'beschikbaarheid', 'meer'],
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
        } catch {
          // profiles tabel optioneel
        }
      }
    } else {
      // Bestaande gebruiker: naam + manager bijwerken
      // Alleen manager overschrijven als we hem daadwerkelijk hebben opgehaald
      const updatePayload: Record<string, unknown> = {
        naam: azUser.displayName ?? email,
        afdeling: azUser.department?.trim() ?? null,
      }
      if (azUser.manager !== undefined) {
        // manager property is gezet door fetchManagersForUsers (ook als null = geen manager)
        updatePayload.manager_naam = managerNaam
        updatePayload.manager_email = managerEmail
      }

      const { error: updateErr } = await adminClient
        .from('gebruiker_rollen')
        .update(updatePayload)
        .eq('user_id', userId)

      if (updateErr) {
        fouten.push(`Update ${email}: ${updateErr.message}`)
      } else {
        managerBijgewerkt++
      }
    }
  }

  return NextResponse.json({
    success: true,
    totaal_azure: azureUsers.length,
    gefilterd,
    filter_debug: {
      gefilterd_domein: filteredDomain,
      gefilterd_e3_licentie: filteredE3,
      gefilterd_geen_afdeling: filteredDept,
      e3_sku_ids_gevonden: e3SkuIds.size,
    },
    verwerkt: teVerwerken.length,
    aangemaakt,
    profiel_gezet: profielGezet,
    manager_bijgewerkt: managerBijgewerkt,
    manager_gevonden: managerStats.gevonden,
    manager_geen: managerStats.geenManager,
    overgeslagen,
    fouten: [...fouten, ...managerStats.fouten],
  })
}
