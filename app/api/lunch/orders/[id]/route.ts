import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/** PATCH: orderstatus bijwerken (alleen admin, bijv. markeer als betaald) */
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
    const status = body.status
    if (!['pending', 'paid', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Ongeldige status' }, { status: 400 })
    }
    const { data, error } = await admin.supabase
      .from('lunch_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken bestelling' }, { status: 500 })
  }
}

/** DELETE: bestelling verwijderen (alleen admin) */
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
    const { error } = await admin.supabase
      .from('lunch_orders')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij verwijderen bestelling' }, { status: 500 })
  }
}
