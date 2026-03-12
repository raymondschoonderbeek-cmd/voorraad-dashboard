import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/** PATCH: product bijwerken (admin) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID ontbreekt' }, { status: 400 })
  try {
    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = String(body.name).trim()
    if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null
    if (typeof body.price_cents === 'number' && body.price_cents >= 0) updates.price_cents = Math.round(body.price_cents)
    if (['italiaanse_bol', 'bruine_driehoek', 'ciabatta'].includes(body.category)) updates.category = body.category
    if (typeof body.active === 'boolean') updates.active = body.active
    if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order
    updates.updated_at = new Date().toISOString()

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    }

    const { data, error } = await admin.supabase
      .from('lunch_products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken product' }, { status: 500 })
  }
}

/** DELETE: product verwijderen (admin) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'ID ontbreekt' }, { status: 400 })
  try {
    const { error } = await admin.supabase.from('lunch_products').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij verwijderen product' }, { status: 500 })
  }
}
