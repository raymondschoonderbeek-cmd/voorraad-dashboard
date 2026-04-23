import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('gazelle_pakket_orders')
    .select('*')
    .order('ontvangen_op', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  const { status } = await request.json()
  if (!status) return NextResponse.json({ error: 'status vereist' }, { status: 400 })

  const { error } = await auth.supabase
    .from('gazelle_pakket_orders')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
