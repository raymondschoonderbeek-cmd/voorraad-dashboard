import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Tikkie webhook: ontvangt betalingsstatus updates.
 * Mock: accepteert POST met body { tikkie_id, status } om status te simuleren.
 * In productie: Tikkie API stuurt webhooks; verifieer handtekening.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const tikkieId = body.tikkie_id ?? body.paymentRequestToken
    const status = body.status ?? body.state

    if (!tikkieId) {
      return NextResponse.json({ error: 'tikkie_id ontbreekt' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: payment, error: payErr } = await admin
      .from('lunch_payments')
      .select('id, order_id, status')
      .eq('tikkie_id', tikkieId)
      .single()

    if (payErr || !payment) {
      return NextResponse.json({ error: 'Betaling niet gevonden' }, { status: 404 })
    }
    if (payment.status === 'paid') {
      return NextResponse.json({ ok: true, message: 'Al betaald' })
    }

    const newStatus = status === 'PAID' || status === 'paid' ? 'paid' : String(status || 'pending').toLowerCase()
    if (!['pending', 'paid', 'failed', 'expired'].includes(newStatus)) {
      return NextResponse.json({ error: 'Ongeldige status' }, { status: 400 })
    }

    const { error: updatePayErr } = await admin
      .from('lunch_payments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', payment.id)
    if (updatePayErr) {
      return NextResponse.json({ error: updatePayErr.message }, { status: 500 })
    }

    if (newStatus === 'paid') {
      await admin
        .from('lunch_orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', payment.order_id)
    }

    return NextResponse.json({ ok: true, status: newStatus })
  } catch (err) {
    console.error('Tikkie webhook error:', err)
    return NextResponse.json({ error: 'Webhook verwerking mislukt' }, { status: 500 })
  }
}
