import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const { data, error } = await supabase
    .from('trusted_ips')
    .select('id, ip_or_cidr, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase, user } = auth

  const body = await request.json()
  const ipOrCidr = String(body?.ip_or_cidr ?? '').trim()
  if (!ipOrCidr) return NextResponse.json({ error: 'ip_or_cidr is verplicht' }, { status: 400 })

  const { data, error } = await supabase
    .from('trusted_ips')
    .insert([{ ip_or_cidr: ipOrCidr, created_by: user?.id }])
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Dit IP-adres bestaat al' }, { status: 400 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is verplicht' }, { status: 400 })

  const { error } = await supabase.from('trusted_ips').delete().eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
