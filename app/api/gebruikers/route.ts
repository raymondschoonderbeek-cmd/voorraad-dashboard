import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

// Haal MFA-status op voor alle gebruikers (vereist service role key)
async function haalMfaStatusOp(userIds: string[]): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  if (userIds.length === 0) return result
  try {
    const admin = createAdminClient()
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await admin.auth.admin.mfa.listFactors({ userId: uid })
        const factors = data?.factors ?? []
        result[uid] = factors.some((f) => f.factor_type === 'totp')
      })
    )
  } catch {
    // Geen admin key of fout: retourneer lege map
  }
  return result
}

// Haal e-mailadressen op voor alle gebruikers (vereist service role key)
async function haalUserEmailsOp(userIds: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  if (userIds.length === 0) return result
  try {
    const admin = createAdminClient()
    const idSet = new Set(userIds)
    let page = 1
    const perPage = 1000
    let hasMore = true
    while (hasMore) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage })
      const users = data?.users ?? []
      for (const u of users) {
        if (idSet.has(u.id)) {
          result[u.id] = u.email ?? ''
        }
      }
      hasMore = users.length >= perPage
      page++
    }
  } catch {
    // Geen admin key of fout: retourneer lege map
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

  const { data: rollen } = await supabase
    .from('gebruiker_rollen')
    .select('*')
    .order('created_at')

  const { data: winkelToegang } = await supabase
    .from('gebruiker_winkels')
    .select('*')

  const { data: winkels } = await supabase
    .from('winkels')
    .select('*')
    .order('naam')

  const userIds = (rollen ?? []).map((r: { user_id: string }) => r.user_id)
  const [mfaStatus, userEmails] = await Promise.all([
    haalMfaStatusOp(userIds),
    haalUserEmailsOp(userIds),
  ])

  return NextResponse.json({
    rollen: rollen ?? [],
    winkelToegang: winkelToegang ?? [],
    winkels: winkels ?? [],
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

  const { email, rol, naam, winkel_ids } = await request.json()

  // Nodig gebruiker uit via Supabase Admin
  const adminClient = await createClient()
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