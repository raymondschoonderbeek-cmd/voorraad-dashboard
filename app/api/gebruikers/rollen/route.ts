import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

// Update rol, naam, email en winkeltoegang
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { user_id, rol, naam, email, mfa_verplicht, winkel_ids } = await request.json()

  // Update rol, naam en mfa_verplicht in gebruiker_rollen
  const updateData: { rol: string; naam: string; mfa_verplicht?: boolean } = { rol, naam }
  if (typeof mfa_verplicht === 'boolean') updateData.mfa_verplicht = mfa_verplicht
  await supabase
    .from('gebruiker_rollen')
    .update(updateData)
    .eq('user_id', user_id)

  // Update e-mail in Auth via admin client (zelfde als invite)
  if (email != null && email.trim() !== '') {
    if (!hasAdminKey()) {
      return NextResponse.json({
        error: 'E-mail wijzigen vereist SUPABASE_SERVICE_ROLE_KEY. Voeg toe aan .env.local en herstart de server.',
      }, { status: 400 })
    }
    const adminClient = createAdminClient()
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      email: email.trim(),
      email_confirm: true, // direct bevestigen, geen verificatiemail
    })
    if (updateError) {
      return NextResponse.json({
        error: updateError.message,
      }, { status: 400 })
    }
  }

  // Update winkeltoegang — verwijder eerst, dan opnieuw invoegen
  await supabase.from('gebruiker_winkels').delete().eq('user_id', user_id)

  if (winkel_ids && winkel_ids.length > 0) {
    await supabase.from('gebruiker_winkels').insert(
      winkel_ids.map((wid: number) => ({ user_id: user_id, winkel_id: wid }))
    )
  }

  return NextResponse.json({ success: true })
}