import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'
import { getAzureToken } from '@/app/api/admin/azure-sync/route'

// Mapping van Microsoft SKU part numbers naar leesbare namen
const SKU_NAMEN: Record<string, string> = {
  SPE_E3: 'Microsoft 365 E3',
  SPE_E5: 'Microsoft 365 E5',
  SPE_F1: 'Microsoft 365 F1',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Premium',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  O365_BUSINESS: 'Microsoft 365 Apps for Business',
  ENTERPRISEPACK: 'Office 365 E3',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  STANDARDPACK: 'Office 365 E1',
  DESKLESSPACK: 'Office 365 F3',
  POWER_BI_PRO: 'Power BI Pro',
  POWER_BI_PREMIUM_PER_USER: 'Power BI Premium Per User',
  PROJECTPREMIUM: 'Project Plan 5',
  PROJECTPROFESSIONAL: 'Project Plan 3',
  VISIOCLIENT: 'Visio Plan 2',
  VISIO_PLAN1_NAT: 'Visio Plan 1',
  MCOEV: 'Microsoft Teams Phone Standard',
  MCOPSTN1: 'Microsoft 365 Domestic Calling Plan',
  INTUNE_A: 'Microsoft Intune Plan 1',
  AAD_PREMIUM: 'Microsoft Entra ID P1',
  AAD_PREMIUM_P2: 'Microsoft Entra ID P2',
  EMS: 'Enterprise Mobility + Security E3',
  EMSPREMIUM: 'Enterprise Mobility + Security E5',
  WIN10_PRO_ENT_SUB: 'Windows 10/11 Enterprise E3',
  WIN_ENT_E5: 'Windows 10/11 Enterprise E5',
  DEFENDER_ENDPOINT_P1: 'Microsoft Defender for Endpoint P1',
  THREAT_INTELLIGENCE: 'Microsoft Defender for Office 365 P2',
  RIGHTSMANAGEMENT: 'Azure Information Protection P1',
  RIGHTSMANAGEMENT_ADHOC: 'Rights Management Adhoc',
  STREAM: 'Microsoft Stream',
  FLOW_FREE: 'Power Automate Free',
  FLOW_P1: 'Power Automate per user plan',
  POWERAPPS_DEV: 'Power Apps Developer Plan',
  FORMS_PRO: 'Dynamics 365 Customer Voice',
  DYN365_ENTERPRISE_PLAN1: 'Dynamics 365 Customer Engagement Plan',
  CRMPLAN2: 'Dynamics 365 for Sales',
}

interface SubscribedSku {
  skuId: string
  skuPartNumber: string
  capabilityStatus: string
  prepaidUnits: { enabled: number; suspended: number; warning: number }
  consumedUnits: number
}

interface GraphUserLicenses {
  id: string
  mail: string | null
  userPrincipalName: string
  assignedLicenses: { skuId: string }[]
}

async function fetchSubscribedSkus(token: string): Promise<SubscribedSku[]> {
  const res = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`subscribedSkus fout: ${err.error?.message ?? res.statusText}`)
  }
  const data = await res.json() as { value?: SubscribedSku[] }
  return data.value ?? []
}

async function fetchAllUsersWithLicenses(token: string): Promise<GraphUserLicenses[]> {
  const users: GraphUserLicenses[] = []
  let url: string | null =
    'https://graph.microsoft.com/v1.0/users' +
    '?$select=id,mail,userPrincipalName,assignedLicenses' +
    '&$filter=accountEnabled eq true' +
    '&$top=999'

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Users met licenties fout: ${err.error?.message ?? res.statusText}`)
    }
    const data = await res.json() as { value?: GraphUserLicenses[]; '@odata.nextLink'?: string }
    users.push(...(data.value ?? []))
    url = data['@odata.nextLink'] ?? null
  }

  return users
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

  // Azure token ophalen
  let token: string
  try {
    token = await getAzureToken()
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Microsoft 365 licenties + gebruikers ophalen
  let skus: SubscribedSku[]
  let msUsers: GraphUserLicenses[]
  try {
    ;[skus, msUsers] = await Promise.all([
      fetchSubscribedSkus(token),
      fetchAllUsersWithLicenses(token),
    ])
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  // Supabase users ophalen zodat we email → user_id kunnen matchen
  const supabaseUsers: { id: string; email: string }[] = []
  let pg = 1
  while (true) {
    const { data: { users: batch } } = await adminClient.auth.admin.listUsers({ page: pg, perPage: 1000 })
    if (!batch || batch.length === 0) break
    supabaseUsers.push(...batch.map(u => ({ id: u.id, email: (u.email ?? '').toLowerCase() })))
    if (batch.length < 1000) break
    pg++
  }
  const emailToUserId = new Map(supabaseUsers.map(u => [u.email, u.id]))

  // Bouw skuId → Set<portalUserId> mapping
  const skuUserMap = new Map<string, Set<string>>()
  for (const msUser of msUsers) {
    const email = (msUser.mail ?? msUser.userPrincipalName ?? '').toLowerCase().trim()
    if (!email || email.includes('#ext#')) continue
    const portalUserId = emailToUserId.get(email)
    if (!portalUserId) continue

    for (const lic of msUser.assignedLicenses ?? []) {
      if (!skuUserMap.has(lic.skuId)) skuUserMap.set(lic.skuId, new Set())
      skuUserMap.get(lic.skuId)!.add(portalUserId)
    }
  }

  const now = new Date().toISOString()
  let catalogusAangemaakt = 0
  let catalogusBijgewerkt = 0
  let koppelingenToegevoegd = 0
  let koppelingenVerwijderd = 0
  const fouten: string[] = []

  for (const sku of skus) {
    // Sla gratis / proef-SKUs over die 0 betaalde units hebben
    if (sku.prepaidUnits.enabled === 0 && sku.consumedUnits === 0) continue

    const naam = SKU_NAMEN[sku.skuPartNumber] ?? sku.skuPartNumber
    const aantallen = sku.prepaidUnits.enabled > 0 ? sku.prepaidUnits.enabled : null

    // Zoek bestaand catalogus-item op microsoft_sku_id
    const { data: bestaand } = await adminClient
      .from('it_catalogus')
      .select('id')
      .eq('microsoft_sku_id', sku.skuId)
      .maybeSingle()

    let catalogusId: string

    if (bestaand) {
      // Bestaand item bijwerken
      const { error: updateErr } = await adminClient
        .from('it_catalogus')
        .update({ naam, aantallen, updated_at: now })
        .eq('id', bestaand.id)

      if (updateErr) {
        fouten.push(`SKU ${sku.skuPartNumber}: ${updateErr.message}`)
        continue
      }
      catalogusId = bestaand.id
      catalogusBijgewerkt++
    } else {
      // Nieuw item aanmaken
      const { data: nieuw, error: insertErr } = await adminClient
        .from('it_catalogus')
        .insert({
          naam,
          type: 'licentie',
          categorie: 'Productiviteit',
          leverancier: 'Microsoft',
          microsoft_sku_id: sku.skuId,
          aantallen,
          updated_at: now,
        })
        .select('id')
        .single()

      if (insertErr || !nieuw) {
        fouten.push(`SKU ${sku.skuPartNumber}: ${insertErr?.message ?? 'Aanmaken mislukt'}`)
        continue
      }
      catalogusId = nieuw.id
      catalogusAangemaakt++
    }

    // Huidige microsoft-gesyncte koppelingen voor dit item
    const { data: huidigeKoppelingen } = await adminClient
      .from('it_catalogus_gebruikers')
      .select('id, user_id')
      .eq('catalogus_id', catalogusId)
      .eq('microsoft_synced', true)

    const huidigeUserIds = new Set((huidigeKoppelingen ?? []).map((k: { user_id: string }) => k.user_id))
    const nieuweUserIds = skuUserMap.get(sku.skuId) ?? new Set<string>()

    // Verwijder koppelingen die niet meer in Microsoft staan
    const teVerwijderen = (huidigeKoppelingen ?? [])
      .filter((k: { user_id: string }) => !nieuweUserIds.has(k.user_id))
      .map((k: { id: string }) => k.id)

    if (teVerwijderen.length > 0) {
      await adminClient.from('it_catalogus_gebruikers').delete().in('id', teVerwijderen)
      koppelingenVerwijderd += teVerwijderen.length
    }

    // Voeg nieuwe koppelingen toe
    const teToevoegen = [...nieuweUserIds]
      .filter(uid => !huidigeUserIds.has(uid))
      .map(uid => ({
        catalogus_id: catalogusId,
        user_id: uid,
        toegewezen_op: now,
        microsoft_synced: true,
      }))

    if (teToevoegen.length > 0) {
      const { error: insertErr } = await adminClient
        .from('it_catalogus_gebruikers')
        .insert(teToevoegen)

      if (insertErr) {
        // Negeer duplicate-key fouten (gebruiker al gekoppeld via handmatige sync)
        if (!insertErr.message.toLowerCase().includes('duplicate') && !insertErr.code?.includes('23505')) {
          fouten.push(`Koppelingen ${naam}: ${insertErr.message}`)
        } else {
          koppelingenToegevoegd += teToevoegen.length
        }
      } else {
        koppelingenToegevoegd += teToevoegen.length
      }
    }
  }

  return NextResponse.json({
    success: true,
    skus_verwerkt: skus.length,
    catalogus_aangemaakt: catalogusAangemaakt,
    catalogus_bijgewerkt: catalogusBijgewerkt,
    koppelingen_toegevoegd: koppelingenToegevoegd,
    koppelingen_verwijderd: koppelingenVerwijderd,
    fouten,
  })
}
