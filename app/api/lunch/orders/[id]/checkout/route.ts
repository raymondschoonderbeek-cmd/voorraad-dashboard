import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/** POST: Tikkie betaallink ophalen (uit lunch_config) */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Order ID ontbreekt' }, { status: 400 })

    const { data: order, error: orderErr } = await supabase
      .from('lunch_orders')
      .select('id, user_id, total_cents, status')
      .eq('id', id)
      .single()
    if (orderErr || !order) {
      return NextResponse.json({ error: 'Bestelling niet gevonden' }, { status: 404 })
    }
    if (order.user_id !== user.id) {
      return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    }
    if (order.status !== 'pending') {
      return NextResponse.json({ error: 'Bestelling is al betaald of geannuleerd' }, { status: 400 })
    }
    if (order.total_cents <= 0) {
      return NextResponse.json({ error: 'Geen bedrag om te betalen' }, { status: 400 })
    }

    const { data: config } = await supabase
      .from('lunch_config')
      .select('tikkie_pay_link')
      .eq('id', 1)
      .single()

    const tikkieUrl = config?.tikkie_pay_link?.trim() || ''

    return NextResponse.json({
      tikkie_id: null,
      tikkie_url: tikkieUrl,
      amount_cents: order.total_cents,
      is_mock: false,
      message: tikkieUrl ? 'Betaal via de link.' : 'Geen betaallink geconfigureerd.',
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij checkout' }, { status: 500 })
  }
}
