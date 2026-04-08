import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

type Ctx = { params: Promise<{ id: string }> }

const VALID_TYPES = ['product', 'licentie'] as const

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.naam === 'string') update.naam = body.naam.trim()
  if (typeof body.type === 'string' && (VALID_TYPES as readonly string[]).includes(body.type)) update.type = body.type
  if (typeof body.categorie === 'string') update.categorie = body.categorie.trim()
  if (typeof body.leverancier === 'string') update.leverancier = body.leverancier.trim()
  if (body.versie === null || typeof body.versie === 'string') update.versie = body.versie === null ? null : String(body.versie).trim() || null
  if (body.aantallen === null) {
    update.aantallen = null
  } else if (body.aantallen != null) {
    const n = typeof body.aantallen === 'number' ? body.aantallen : parseInt(String(body.aantallen), 10)
    if (!Number.isNaN(n)) update.aantallen = n
  }
  if (body.notities === null || typeof body.notities === 'string') update.notities = body.notities === null ? null : String(body.notities).trim() || null

  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })
  }

  const { data, error } = await auth.supabase.from('it_catalogus').update(update).eq('id', id).select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const { error } = await auth.supabase.from('it_catalogus').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
