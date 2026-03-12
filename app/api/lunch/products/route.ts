import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/** GET: lijst producten (actieve voor iedereen, alle voor admin) */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const { user, supabase, isAdmin } = await requireAuth()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let query = supabase
      .from('lunch_products')
      .select('id, name, description, price_cents, category, active, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (!isAdmin) {
      query = query.eq('active', true)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij ophalen producten' }, { status: 500 })
  }
}

/** POST: nieuw product (admin) */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })
  try {
    const body = await request.json().catch(() => ({}))
    const { name, description, price_cents, category, active, sort_order } = body
    if (!name || typeof price_cents !== 'number' || price_cents < 0) {
      return NextResponse.json({ error: 'Naam en prijs verplicht' }, { status: 400 })
    }
    const { data, error } = await admin.supabase
      .from('lunch_products')
      .insert({
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        price_cents: Math.round(price_cents),
        category: ['italiaanse_bol', 'bruine_driehoek', 'ciabatta'].includes(category) ? category : 'italiaanse_bol',
        active: active !== false,
        sort_order: typeof sort_order === 'number' ? sort_order : 0,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij aanmaken product' }, { status: 500 })
  }
}
