import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { parseHHmmToMinutes } from '@/lib/amsterdam-time'
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
      .select(
        'tikkie_pay_link, order_weekdays, closed_dates, reminder_mail_enabled, reminder_weekday, reminder_time_local'
      )
      .eq('id', 1)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const orderWeekdays = normalizeOrderWeekdays(data?.order_weekdays) ?? [1, 2, 3, 4, 5]
    const rw = data?.reminder_weekday
    const reminder_weekday =
      typeof rw === 'number' && rw >= 1 && rw <= 7 ? rw : 5
    const rt = data?.reminder_time_local
    const reminder_time_local =
      typeof rt === 'string' && parseHHmmToMinutes(rt) != null ? rt : '08:00'
    return NextResponse.json({
      tikkie_pay_link: data?.tikkie_pay_link ?? '',
      order_weekdays: orderWeekdays,
      closed_dates: formatClosedDates(data?.closed_dates),
      reminder_mail_enabled: data?.reminder_mail_enabled === true,
      reminder_weekday,
      reminder_time_local,
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

    if (body.reminder_mail_enabled !== undefined) {
      update.reminder_mail_enabled = body.reminder_mail_enabled === true
    }

    if (body.reminder_weekday !== undefined) {
      const n = Number(body.reminder_weekday)
      if (!Number.isInteger(n) || n < 1 || n > 7) {
        return NextResponse.json({ error: 'reminder_weekday: gebruik 1 (ma) t/m 7 (zo).' }, { status: 400 })
      }
      update.reminder_weekday = n
    }

    if (body.reminder_time_local !== undefined) {
      const s = String(body.reminder_time_local).trim()
      if (parseHHmmToMinutes(s) == null) {
        return NextResponse.json({ error: 'reminder_time_local: gebruik HH:mm (24 uur).' }, { status: 400 })
      }
      update.reminder_time_local = s
    }

    const { error } = await admin.supabase.from('lunch_config').update(update).eq('id', 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: row } = await admin.supabase
      .from('lunch_config')
      .select(
        'tikkie_pay_link, order_weekdays, closed_dates, reminder_mail_enabled, reminder_weekday, reminder_time_local'
      )
      .eq('id', 1)
      .single()

    const orderWeekdays = normalizeOrderWeekdays(row?.order_weekdays) ?? [1, 2, 3, 4, 5]
    const rw = row?.reminder_weekday
    const reminder_weekday =
      typeof rw === 'number' && rw >= 1 && rw <= 7 ? rw : 5
    const rt = row?.reminder_time_local
    const reminder_time_local =
      typeof rt === 'string' && parseHHmmToMinutes(rt) != null ? rt : '08:00'
    return NextResponse.json({
      tikkie_pay_link: row?.tikkie_pay_link ?? '',
      order_weekdays: orderWeekdays,
      closed_dates: formatClosedDates(row?.closed_dates),
      reminder_mail_enabled: row?.reminder_mail_enabled === true,
      reminder_weekday,
      reminder_time_local,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken instellingen' }, { status: 500 })
  }
}
