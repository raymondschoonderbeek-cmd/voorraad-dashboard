import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { data } = await supabase
    .from('winkel_activiteit')
    .select('id,winkel_id,kind,body,meta,created_at,created_by')
    .eq('winkel_id', Number(id))
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => ({})) as { kind?: string; body?: string; meta?: Record<string, unknown> }
  if (!body.body?.trim()) return NextResponse.json({ error: 'body is verplicht' }, { status: 400 })
  const kind = ['notitie', 'taak', 'belverslag'].includes(body.kind ?? '') ? body.kind : 'notitie'
  const { data, error } = await supabase.from('winkel_activiteit').insert({
    winkel_id: Number(id), kind, body: body.body.trim(), meta: body.meta ?? null, created_by: user.id
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
