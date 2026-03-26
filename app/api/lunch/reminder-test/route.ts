import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { getAmsterdamYmd } from '@/lib/amsterdam-time'
import { effectiveOrderDateForReminderAt, normalizeOrderEndTimeLocal } from '@/lib/lunch-order-deadline'
import { normalizeOrderWeekdays } from '@/lib/lunch-schedule'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLunchReminderToEmail, voornaamUitVolledigeNaam } from '@/lib/lunch-reminder-mail'
import { isMailgunConfigured } from '@/lib/send-welcome-email'

/**
 * POST: stuur test-herinnering naar het e-mailadres van de ingelogde beheerder.
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  if (!isMailgunConfigured()) {
    return NextResponse.json(
      { error: 'Mailgun niet geconfigureerd (MAILGUN_API_KEY, MAILGUN_DOMAIN).' },
      { status: 503 }
    )
  }

  const { user } = admin
  const email = user.email?.trim()
  if (!email) {
    return NextResponse.json({ error: 'Geen e-mail op account' }, { status: 400 })
  }

  let orderDate = getAmsterdamYmd(new Date())
  try {
    const body = await request.json().catch(() => ({}))
    if (typeof body.orderDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.orderDate)) {
      orderDate = body.orderDate
    } else {
      const { data: cfg } = await admin.supabase
        .from('lunch_config')
        .select('order_weekdays, closed_dates, order_end_time_local')
        .eq('id', 1)
        .maybeSingle()
      const orderWeekdays = normalizeOrderWeekdays(cfg?.order_weekdays) ?? [1, 2, 3, 4, 5]
      const closedRaw = cfg?.closed_dates
      const closedDates: string[] = Array.isArray(closedRaw)
        ? closedRaw.map((x: unknown) => String(x).slice(0, 10))
        : []
      const endNorm = normalizeOrderEndTimeLocal(
        typeof cfg?.order_end_time_local === 'string' ? cfg.order_end_time_local : null
      )
      orderDate =
        effectiveOrderDateForReminderAt(new Date(), orderWeekdays, closedDates, endNorm) ?? orderDate
    }
  } catch {
    /* default vandaag */
  }

  let firstName = ''
  try {
    const svc = createAdminClient()
    const { data: rollen } = await svc
      .from('gebruiker_rollen')
      .select('naam')
      .eq('user_id', user.id)
    for (const r of rollen ?? []) {
      const fn = voornaamUitVolledigeNaam((r as { naam?: string | null }).naam)
      if (fn) {
        firstName = fn
        break
      }
    }
  } catch {
    /* geen voornaam */
  }

  try {
    await sendLunchReminderToEmail(email, orderDate, firstName)
    return NextResponse.json({ ok: true, to: email, orderDate })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Versturen mislukt'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
