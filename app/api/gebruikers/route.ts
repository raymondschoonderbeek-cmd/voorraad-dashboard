import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Controleer of gebruiker admin is
async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

// Haal alle gebruikers op
export async function GET() {
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
    .select('id, naam, dealer_nummer')
    .order('naam')

  return NextResponse.json({ rollen: rollen ?? [], winkelToegang: winkelToegang ?? [], winkels: winkels ?? [] })
}

// Nieuwe gebruiker uitnodigen
export async function POST(request: NextRequest) {
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