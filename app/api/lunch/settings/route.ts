import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import {
  normalizeClosedDates,
  normalizeOrderWeekdays,
  ymdFromDate,
} from '@/lib/lunch-schedule'

function formatClosedDates(raw: unknown): string[] {
  if (!raw) return []
  if (!Array.isArray(raw)) return []
  return raw
    .map(d => {
      if (typeof d === 'string') return d.slice(0, 10)
      if (d instanceof Date) return ymdFromDate(d)
      return String(d).slice(0, 10)
    })
    .filter(Boolean)
    .sort()
}

/** GET: lunch-instellingen (o.a. tikkie + bestelschema; leesbaar voor ingelogde gebruikers) */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const { user, supabase } = await requireAuth()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('lunch_config')
      .select('tikkie_pay_link, order_weekdays, closed_dates')
      .eq('id', 1)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const orderWeekdays = normalizeOrderWeekdays(data?.order_weekdays) ?? [1, 2, 3, 4, 5]
    return NextResponse.json({
      tikkie_pay_link: data?.tikkie_pay_link ?? '',
      order_weekdays: orderWeekdays,
      closed_dates: formatClosedDates(data?.closed_dates),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij ophalen instellingen' }, { status: 500 })
  }
}

/** PATCH: lunch-instellingen bijwerken (alleen admin) */
export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })
  try {
    const body = await request.json().catch(() => ({}))

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.tikkie_pay_link === 'string') {
      update.tikkie_pay_link = body.tikkie_pay_link.trim()
    }

    if (body.order_weekdays !== undefined) {
      const w = normalizeOrderWeekdays(body.order_weekdays)
      if (!w) {
        return NextResponse.json(
          { error: 'order_weekdays moet een niet-lege lijst zijn met getallen 1 (ma) t/m 7 (zo).' },
          { status: 400 }
        )
      }
      update.order_weekdays = w
    }

    if (body.closed_dates !== undefined) {
      const c = normalizeClosedDates(body.closed_dates)
      if (!c) {
        return NextResponse.json({ error: 'closed_dates: ongeldige datums (gebruik YYYY-MM-DD).' }, { status: 400 })
      }
      update.closed_dates = c
    }

    const { error } = await admin.supabase.from('lunch_config').update(update).eq('id', 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: row } = await admin.supabase
      .from('lunch_config')
      .select('tikkie_pay_link, order_weekdays, closed_dates')
      .eq('id', 1)
      .single()

    const orderWeekdays = normalizeOrderWeekdays(row?.order_weekdays) ?? [1, 2, 3, 4, 5]
    return NextResponse.json({
      tikkie_pay_link: row?.tikkie_pay_link ?? '',
      order_weekdays: orderWeekdays,
      closed_dates: formatClosedDates(row?.closed_dates),
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken instellingen' }, { status: 500 })
  }
}
