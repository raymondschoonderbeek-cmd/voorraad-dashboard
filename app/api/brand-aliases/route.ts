import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function normKey(input: any) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('brand_aliases')
    .select('id, alias_key, canonical_key, canonical_label, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'DB_ERROR', message: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const alias = normKey(body.alias)
  const canonical = normKey(body.canonical)
  const canonicalLabel = String(body.canonicalLabel ?? '').trim() || null

  if (!alias || !canonical) {
    return NextResponse.json(
      { error: 'VALIDATION', message: 'Alias en Canonical zijn verplicht.' },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('brand_aliases').upsert(
    { alias_key: alias, canonical_key: canonical, canonical_label: canonicalLabel },
    { onConflict: 'alias_key' }
  )

  if (error) return NextResponse.json({ error: 'DB_ERROR', message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'VALIDATION', message: 'id ontbreekt' }, { status: 400 })

  const { error } = await supabase.from('brand_aliases').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'DB_ERROR', message: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}