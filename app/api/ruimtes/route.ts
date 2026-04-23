import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRoomAvailability } from '@/lib/joan'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { ruimtes } = await getRoomAvailability()
  return NextResponse.json(ruimtes, { headers: { 'Cache-Control': 'no-store' } })
}
