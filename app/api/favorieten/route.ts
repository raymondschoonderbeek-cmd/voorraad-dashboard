import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

/** Haal favoriete winkel-ids op voor de ingelogde gebruiker */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('gebruiker_favorieten')
    .select('winkel_id')
    .eq('user_id', user.id)

  const winkel_ids = (data ?? []).map((r: { winkel_id: number }) => r.winkel_id)
  return NextResponse.json({ winkel_ids })
}

/** Voeg winkel toe aan favorieten of verwijder (toggle) */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const winkel_id = typeof body.winkel_id === 'number' ? body.winkel_id : parseInt(String(body.winkel_id ?? ''), 10)
  if (!winkel_id || Number.isNaN(winkel_id)) {
    return NextResponse.json({ error: 'winkel_id is verplicht' }, { status: 400 })
  }

  const { data: bestaand } = await supabase
    .from('gebruiker_favorieten')
    .select('winkel_id')
    .eq('user_id', user.id)
    .eq('winkel_id', winkel_id)
    .single()

  if (bestaand) {
    await supabase
      .from('gebruiker_favorieten')
      .delete()
      .eq('user_id', user.id)
      .eq('winkel_id', winkel_id)
    return NextResponse.json({ favoriet: false, winkel_ids: await haalIdsOp(supabase, user.id) })
  }

  await supabase
    .from('gebruiker_favorieten')
    .insert({ user_id: user.id, winkel_id })
  return NextResponse.json({ favoriet: true, winkel_ids: await haalIdsOp(supabase, user.id) })
}

async function haalIdsOp(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<number[]> {
  const { data } = await supabase
    .from('gebruiker_favorieten')
    .select('winkel_id')
    .eq('user_id', userId)
  return (data ?? []).map((r: { winkel_id: number }) => r.winkel_id)
}
