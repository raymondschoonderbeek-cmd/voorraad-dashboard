import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('winkel_contacten')
    .select('id, naam, telefoon, email, opmerking, created_at')
    .eq('winkel_id', Number(id))
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({})) as { naam?: string; telefoon?: string; email?: string; opmerking?: string }

  if (!body.naam?.trim()) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })

  const { data, error } = await supabase
    .from('winkel_contacten')
    .insert({
      winkel_id: Number(id),
      naam: body.naam.trim(),
      telefoon: body.telefoon?.trim() || null,
      email: body.email?.trim() || null,
      opmerking: body.opmerking?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
