import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

// Update rol en winkeltoegang
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { user_id, rol, naam, winkel_ids } = await request.json()

  // Update rol
  await supabase
    .from('gebruiker_rollen')
    .update({ rol, naam })
    .eq('user_id', user_id)

  // Update winkeltoegang — verwijder eerst, dan opnieuw invoegen
  await supabase.from('gebruiker_winkels').delete().eq('user_id', user_id)

  if (winkel_ids && winkel_ids.length > 0) {
    await supabase.from('gebruiker_winkels').insert(
      winkel_ids.map((wid: number) => ({ user_id: user_id, winkel_id: wid }))
    )
  }

  return NextResponse.json({ success: true })
}