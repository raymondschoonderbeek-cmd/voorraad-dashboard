import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { checkOrderDateAllowed, normalizeOrderWeekdays, ymdFromDate } from '@/lib/lunch-schedule'

/** GET: mijn bestellingen of alle (admin) */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const { user, supabase, isAdmin } = await requireAuth()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') // YYYY-MM-DD
    const adminView = isAdmin && searchParams.get('admin') === 'true'

    let query = supabase
      .from('lunch_orders')
      .select(`
        id,
        user_id,
        user_email,
        user_name,
        order_date,
        status,
        total_cents,
        created_at,
        lunch_order_items (
          id,
          quantity,
          unit_price_cents,
          lunch_products (id, name)
        )
      `)
      .order('created_at', { ascending: false })

    if (!adminView) {
      query = query.eq('user_id', user.id)
    }
    if (date) {
      query = query.eq('order_date', date)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij ophalen bestellingen' }, { status: 500 })
  }
}

/** POST: nieuwe bestelling aanmaken */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const items = body.items as Array<{ product_id: string; quantity: number }> | undefined
    const orderDate = body.order_date as string | undefined

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Geen items in bestelling' }, { status: 400 })
    }

    const today = new Date().toISOString().slice(0, 10)
    const date = orderDate || today

    const { data: cfg } = await supabase
      .from('lunch_config')
      .select('order_weekdays, closed_dates')
      .eq('id', 1)
      .single()

    const orderWeekdays = normalizeOrderWeekdays(cfg?.order_weekdays) ?? [1, 2, 3, 4, 5]
    const closedRaw = cfg?.closed_dates
    const closedDates: string[] = Array.isArray(closedRaw)
      ? closedRaw.map(d => (typeof d === 'string' ? d.slice(0, 10) : d instanceof Date ? ymdFromDate(d) : String(d).slice(0, 10)))
      : []

    const allowed = checkOrderDateAllowed(date, orderWeekdays, closedDates)
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.description }, { status: 400 })
    }

    // Haal producten op voor prijzen
    const productIds = [...new Set(items.map((i: { product_id: string }) => i.product_id))]
    const { data: products, error: prodErr } = await supabase
      .from('lunch_products')
      .select('id, name, price_cents')
      .eq('active', true)
      .in('id', productIds)
    if (prodErr || !products?.length) {
      return NextResponse.json({ error: 'Producten niet gevonden' }, { status: 400 })
    }
    const priceMap = Object.fromEntries(products.map(p => [p.id, p.price_cents]))

    let totalCents = 0
    const validItems: { product_id: string; quantity: number; unit_price_cents: number }[] = []
    for (const { product_id, quantity } of items) {
      const qty = Math.max(1, Math.min(99, Math.round(Number(quantity)) || 1))
      const price = priceMap[product_id]
      if (!price) continue
      validItems.push({ product_id, quantity: qty, unit_price_cents: price })
      totalCents += price * qty
    }
    if (validItems.length === 0) {
      return NextResponse.json({ error: 'Geen geldige items' }, { status: 400 })
    }

    const { data: rolData } = await supabase
      .from('gebruiker_rollen')
      .select('naam')
      .eq('user_id', user.id)
      .single()

    const { data: order, error: orderErr } = await supabase
      .from('lunch_orders')
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        user_name: rolData?.naam ?? null,
        order_date: date,
        status: 'pending',
        total_cents: totalCents,
      })
      .select()
      .single()
    if (orderErr || !order) {
      return NextResponse.json({ error: orderErr?.message ?? 'Bestelling aanmaken mislukt' }, { status: 500 })
    }

    const { error: itemsErr } = await supabase.from('lunch_order_items').insert(
      validItems.map(i => ({
        order_id: order.id,
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price_cents: i.unit_price_cents,
      }))
    )
    if (itemsErr) {
      await supabase.from('lunch_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: 'Items opslaan mislukt' }, { status: 500 })
    }

    return NextResponse.json({
      id: order.id,
      order_date: order.order_date,
      status: order.status,
      total_cents: order.total_cents,
      user_name: order.user_name ?? null,
      items: validItems.map(i => {
        const p = products.find((x: { id: string }) => x.id === i.product_id) as { name?: string } | undefined
        return { ...i, product_name: p?.name ?? null }
      }),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij aanmaken bestelling' }, { status: 500 })
  }
}
