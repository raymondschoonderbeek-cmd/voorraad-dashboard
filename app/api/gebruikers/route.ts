import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { withRateLimit } from '@/lib/api-middleware'

// Controleer of gebruiker admin is
async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

// Haal MFA-status op via Postgres-functie (leest auth.mfa_factors)
async function haalMfaStatusOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[]
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  if (userIds.length === 0) return result
  try {
    const { data } = await supabase.rpc('get_user_mfa_status', { user_ids: userIds })
    for (const row of data ?? []) {
      const uid = (row as { user_id: string }).user_id
      if (uid) result[uid] = true
    }
    // Vul false voor users zonder MFA (zodat we — MFA tonen)
    for (const uid of userIds) {
      if (!(uid in result)) result[uid] = false
    }
  } catch {
    // Migratie mogelijk nog niet uitgevoerd
  }
  return result
}

// Haal e-mailadressen op via Postgres-functie (leest auth.users)
async function haalUserEmailsOp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userIds: string[]
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (userIds.length === 0) return result
  try {
    const { data } = await supabase.rpc('get_user_emails', {
      user_ids: userIds,
    })
    for (const row of data ?? []) {
      const uid = (row as { user_id: string }).user_id
      const email = (row as { email: string }).email ?? ''
      if (uid && email) result[uid] = email
    }
  } catch {
    // Migratie mogelijk nog niet uitgevoerd
  }
  return result
}

// Haal alle gebruikers op
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  // Gebruik service role client om RLS te omzeilen: admins moeten alle gebruikers zien
  const client = hasAdminKey() ? createAdminClient() : supabase

  const { data: rollen } = await client
    .from('gebruiker_rollen')
    .select('*')
    .order('created_at')

  const { data: winkelToegang } = await client
    .from('gebruiker_winkels')
    .select('*')

  const { data: winkelsRaw } = await client
    .from('winkels')
    .select('*')
    .order('naam')

  const venditDealerNummers = new Set<string>()
  const venditLaatstPerDealer = new Map<string, string>() // dealer_nummer -> ISO datum
  const venditWinkels = (winkelsRaw ?? []).filter((w: { api_type?: string }) => w.api_type === 'vendit')
  function normalizeDealer(v: unknown): string {
    const s = String(v ?? '').trim()
    if (!s) return s
    const withoutLeadingZeros = s.replace(/^0+/, '') || '0'
    return withoutLeadingZeros
  }
  if (venditWinkels.length > 0) {
    const BATCH = 1000
    let offset = 0
    let hasMore = true
    while (hasMore) {
      const { data: batch } = await client
        .from('vendit_stock')
        .select('dealer_number')
        .range(offset, offset + BATCH - 1)
      const rows = batch ?? []
      for (const row of rows) {
        const d = row?.dealer_number
        if (d != null) {
          const n = normalizeDealer(d)
          venditDealerNummers.add(n)
          venditDealerNummers.add(String(d).trim())
        }
      }
      hasMore = rows.length === BATCH
      offset += BATCH
    }
    const BATCH_STATS = 1000
    let offsetStats = 0
    let hasMoreStats = true
    while (hasMoreStats) {
      const { data: statsBatch } = await client
        .from('vendit_stock')
        .select('dealer_number, file_date_time')
        .range(offsetStats, offsetStats + BATCH_STATS - 1)
      const statsRows = statsBatch ?? []
      for (const row of statsRows) {
        const d = row?.dealer_number
        const dt = row?.file_date_time
        if (d != null && dt) {
          const k = String(d).trim()
          const kNorm = normalizeDealer(d)
          const existing = venditLaatstPerDealer.get(k) ?? venditLaatstPerDealer.get(kNorm)
          const dtStr = typeof dt === 'string' ? dt : (dt ? new Date(dt).toISOString() : '')
          if (dtStr && (!existing || dtStr > existing)) {
            venditLaatstPerDealer.set(k, dtStr)
            venditLaatstPerDealer.set(kNorm, dtStr)
          }
        }
      }
      hasMoreStats = statsRows.length === BATCH_STATS
      offsetStats += BATCH_STATS
    }
  }

  const winkels = (winkelsRaw ?? []).map((w: any) => {
    if (w.api_type === 'vendit') {
      const key = String(w.dealer_nummer ?? '').trim()
      const keyNorm = normalizeDealer(w.dealer_nummer)
      const inDataset = venditDealerNummers.has(key) || venditDealerNummers.has(keyNorm)
      const laatstDatum = venditLaatstPerDealer.get(key) ?? venditLaatstPerDealer.get(keyNorm) ?? null
      return {
        ...w,
        vendit_in_dataset: inDataset,
        vendit_laatst_datum: laatstDatum,
      }
    }
    return w
  })

  const userIds = (rollen ?? []).map((r: { user_id: string }) => r.user_id)
  const [mfaStatus, userEmails] = await Promise.all([
    haalMfaStatusOp(supabase, userIds),
    haalUserEmailsOp(supabase, userIds),
  ])

  return NextResponse.json({
    rollen: rollen ?? [],
    winkelToegang: winkelToegang ?? [],
    winkels,
    mfaStatus,
    userEmails,
  })
}

// Nieuwe gebruiker uitnodigen
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { email, rol, naam, mfa_verplicht, winkel_ids } = await request.json()

  if (!hasAdminKey()) {
    return NextResponse.json({
      error: 'Uitnodigen vereist SUPABASE_SERVICE_ROLE_KEY. Voeg deze toe aan .env.local en herstart de server.',
    }, { status: 400 })
  }
  const adminClient = createAdminClient()
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email)

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 })
  }

  const newUserId = invited.user.id

  // Sla rol op
  await supabase.from('gebruiker_rollen').insert([{
    user_id: newUserId,
    rol: rol ?? 'viewer',
    naam: naam ?? email,
    mfa_verplicht: mfa_verplicht === true,
  }])

  // Sla winkeltoegang op
  if (winkel_ids && winkel_ids.length > 0) {
    await supabase.from('gebruiker_winkels').insert(
      winkel_ids.map((wid: number) => ({ user_id: newUserId, winkel_id: wid }))
    )
  }

  return NextResponse.json({ success: true })
}

// Gebruiker verwijderen
export async function DELETE(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  await supabase.from('gebruiker_rollen').delete().eq('user_id', userId)
  await supabase.from('gebruiker_winkels').delete().eq('user_id', userId)

  return NextResponse.json({ success: true })
}