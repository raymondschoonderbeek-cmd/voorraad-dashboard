import { NextRequest, NextResponse } from 'next/server'
import { requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import type { DrgNewsAfdeling } from '@/lib/news-afdelingen'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.label === 'string') {
    const l = body.label.trim()
    if (!l) return NextResponse.json({ error: 'label mag niet leeg zijn' }, { status: 400 })
    update.label = l
  }
  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order)
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'sort_order ongeldig' }, { status: 400 })
    update.sort_order = Math.trunc(n)
  }

  if (!('label' in body) && body.sort_order === undefined) {
    return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('drg_news_afdelingen')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ afdeling: data as DrgNewsAfdeling })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params

  const { data: row, error: fetchErr } = await auth.supabase
    .from('drg_news_afdelingen')
    .select('slug')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!row?.slug) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const { count, error: cntErr } = await auth.supabase
    .from('drg_news_posts')
    .select('id', { count: 'exact', head: true })
    .eq('category', row.slug)
  if (cntErr) return NextResponse.json({ error: cntErr.message }, { status: 500 })
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Deze afdeling kan niet worden verwijderd: er zijn nog nieuwsberichten gekoppeld.' },
      { status: 409 }
    )
  }

  const { error } = await auth.supabase.from('drg_news_afdelingen').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
