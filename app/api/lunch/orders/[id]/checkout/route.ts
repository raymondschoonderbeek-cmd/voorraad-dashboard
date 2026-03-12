import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/** POST: Tikkie aanmaken voor bestelling (mock: retourneert fake URL) */
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

    // Mock Tikkie: genereer fake ID en URL
    const mockTikkieId = `mock_${order.id.replace(/-/g, '')}_${Date.now()}`
    const mockTikkieUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/lunch?tikkie=mock&id=${mockTikkieId}`

    const { error: payErr } = await supabase.from('lunch_payments').insert({
      order_id: order.id,
      tikkie_id: mockTikkieId,
      tikkie_url: mockTikkieUrl,
      status: 'pending',
      amount_cents: order.total_cents,
    })
    if (payErr) {
      return NextResponse.json({ error: 'Betaling aanmaken mislukt' }, { status: 500 })
    }

    return NextResponse.json({
      tikkie_id: mockTikkieId,
      tikkie_url: mockTikkieUrl,
      amount_cents: order.total_cents,
      message: 'Mock Tikkie: klik op de link om te "betalen". In productie wordt een echte Tikkie aangemaakt.',
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij checkout' }, { status: 500 })
  }
}
