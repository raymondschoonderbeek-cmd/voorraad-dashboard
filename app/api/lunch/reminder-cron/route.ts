import { NextRequest, NextResponse } from 'next/server'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import {
  getAmsterdamHourMinute,
  getAmsterdamIsoWeekday,
  getAmsterdamYmd,
  isWithinReminderWindow,
  parseHHmmToMinutes,
} from '@/lib/amsterdam-time'
import {
  effectiveOrderDateForReminderAt,
  normalizeOrderEndTimeLocal,
  shouldSkipReminderBecauseEarliestOrderSlotClosed,
} from '@/lib/lunch-order-deadline'
import { checkOrderDateAllowed, normalizeOrderWeekdays } from '@/lib/lunch-schedule'
import { fetchLunchReminderRecipients } from '@/lib/lunch-reminder-recipients'
import { sendLunchReminderToEmail } from '@/lib/lunch-reminder-mail'
import { isMailgunConfigured } from '@/lib/send-welcome-email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * GET: aanroepen door scheduler (cron-job.org elke 5 min) met Authorization: Bearer CRON_SECRET
 * Vercel Hobby heeft geen ingebouwde cron — gebruik externe scheduler.
 *
 * Test (alleen jouw adres, geen DB-log lunch_reminder_sent):
 *   ?test_only_email=jij@example.com          — zelfde regels als productie (dag/tijd/besteldag)
 *   ?test_only_email=jij@example.com&force=1  — direct versturen (geen dag/tijd/besteldag-checks)
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const secret = process.env.CRON_SECRET?.trim()
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt.' },
      { status: 503 }
    )
  }

  if (!isMailgunConfigured()) {
    return NextResponse.json(
      { error: 'Mailgun niet geconfigureerd (MAILGUN_API_KEY, MAILGUN_DOMAIN).' },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const testOnlyRaw = searchParams.get('test_only_email')?.trim().toLowerCase()
  const forceTest = searchParams.get('force') === '1' || searchParams.get('force') === 'true'

  const now = new Date()
  const admin = createAdminClient()

  const { data: cfg, error: cfgErr } = await admin
    .from('lunch_config')
    .select(
      'reminder_mail_enabled, reminder_weekday, reminder_time_local, order_weekdays, closed_dates, order_end_time_local'
    )
    .eq('id', 1)
    .single()

  if (cfgErr || !cfg) {
    return NextResponse.json({ error: cfgErr?.message ?? 'Geen lunch_config' }, { status: 500 })
  }

  const orderWeekdays = normalizeOrderWeekdays(cfg.order_weekdays) ?? [1, 2, 3, 4, 5]
  const closedRaw = cfg.closed_dates
  const closedDates: string[] = Array.isArray(closedRaw)
    ? closedRaw.map((x: unknown) => String(x).slice(0, 10))
    : []
  const endNorm = normalizeOrderEndTimeLocal(
    typeof cfg.order_end_time_local === 'string' ? cfg.order_end_time_local : null
  )
  const slotSkip = shouldSkipReminderBecauseEarliestOrderSlotClosed(now, orderWeekdays, closedDates)
  const ymd =
    effectiveOrderDateForReminderAt(now, orderWeekdays, closedDates, endNorm) ?? getAmsterdamYmd(now)

  /** Eén testmail naar dit adres; geen insert in lunch_reminder_sent */
  if (testOnlyRaw) {
    if (!EMAIL_RE.test(testOnlyRaw)) {
      return NextResponse.json({ error: 'test_only_email: ongeldig e-mailadres' }, { status: 400 })
    }

    if (!forceTest) {
      if (!cfg.reminder_mail_enabled) {
        return NextResponse.json({ ok: false, skipped: 'reminder_mail_disabled', hint: 'Zet aan in Lunch beheer of gebruik force=1' }, { status: 200 })
      }

      const weekdayCfg = Number(cfg.reminder_weekday)
      const isoToday = getAmsterdamIsoWeekday(now)
      if (isoToday !== weekdayCfg) {
        return NextResponse.json({
          ok: false,
          skipped: 'wrong_weekday',
          amsterdam_weekday: isoToday,
          configured: weekdayCfg,
          hint: 'Of: test_only_email=...&force=1 om dag/tijd te negeren',
        }, { status: 200 })
      }

      const timeStr = typeof cfg.reminder_time_local === 'string' ? cfg.reminder_time_local : '08:00'
      const targetMin = parseHHmmToMinutes(timeStr)
      if (targetMin == null) {
        return NextResponse.json({ error: 'Ongeldige reminder_time_local in database' }, { status: 500 })
      }

      if (!isWithinReminderWindow(now, targetMin)) {
        const { hour, minute } = getAmsterdamHourMinute(now)
        return NextResponse.json({
          ok: false,
          skipped: 'outside_time_window',
          amsterdam_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
          window_starts: timeStr,
          hint: 'Of: test_only_email=...&force=1',
        }, { status: 200 })
      }

      if (slotSkip.skip) {
        return NextResponse.json({
          ok: false,
          skipped: 'order_slot_closed',
          next_slot: slotSkip.nextSlotYmd,
          hint:
            'Eerstvolgende besteldag op de kalender staat als gesloten — geen herinnering. Of: force=1 om te negeren.',
        }, { status: 200 })
      }

      const dateCheck = checkOrderDateAllowed(ymd, orderWeekdays, closedDates)
      if (!dateCheck.ok) {
        return NextResponse.json({
          ok: false,
          skipped: 'order_date_not_allowed',
          reason: dateCheck.variant,
          ymd,
          hint: 'Of: force=1',
        }, { status: 200 })
      }
    }

    try {
      await sendLunchReminderToEmail(testOnlyRaw, ymd)
      return NextResponse.json({
        ok: true,
        mode: 'test_only',
        sent_to: testOnlyRaw,
        order_date: ymd,
        force: forceTest,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }
  }

  if (!cfg.reminder_mail_enabled) {
    return NextResponse.json({ ok: true, skipped: 'reminder_mail_disabled' })
  }

  const weekdayCfg = Number(cfg.reminder_weekday)
  const isoToday = getAmsterdamIsoWeekday(now)
  if (isoToday !== weekdayCfg) {
    return NextResponse.json({
      ok: true,
      skipped: 'wrong_weekday',
      amsterdam_weekday: isoToday,
      configured: weekdayCfg,
    })
  }

  const timeStr = typeof cfg.reminder_time_local === 'string' ? cfg.reminder_time_local : '08:00'
  const targetMin = parseHHmmToMinutes(timeStr)
  if (targetMin == null) {
    return NextResponse.json({ error: 'Ongeldige reminder_time_local in database' }, { status: 500 })
  }

  if (!isWithinReminderWindow(now, targetMin)) {
    const { hour, minute } = getAmsterdamHourMinute(now)
    return NextResponse.json({
      ok: true,
      skipped: 'outside_time_window',
      amsterdam_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      window_starts: timeStr,
    })
  }

  if (slotSkip.skip) {
    return NextResponse.json({
      ok: true,
      skipped: 'order_slot_closed',
      next_slot: slotSkip.nextSlotYmd,
      hint: 'Eerstvolgende besteldag op de kalender staat als gesloten — er wordt geen herinnering verstuurd.',
    })
  }

  const dateCheck = checkOrderDateAllowed(ymd, orderWeekdays, closedDates)
  if (!dateCheck.ok) {
    return NextResponse.json({
      ok: true,
      skipped: 'order_date_not_allowed',
      reason: dateCheck.variant,
      ymd,
    })
  }

  let recipients: Awaited<ReturnType<typeof fetchLunchReminderRecipients>>
  try {
    recipients = await fetchLunchReminderRecipients()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Recipients ophalen mislukt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: already } = await admin
    .from('lunch_reminder_sent')
    .select('user_id')
    .eq('reminder_date', ymd)

  const sentSet = new Set((already ?? []).map((r: { user_id: string }) => r.user_id))

  const toSend = recipients.filter(r => !sentSet.has(r.userId))

  const results = await Promise.allSettled(
    toSend.map(async ({ userId, email, firstName }) => {
      await sendLunchReminderToEmail(email, ymd, firstName)
      const { error: insErr } = await admin.from('lunch_reminder_sent').insert({
        user_id: userId,
        reminder_date: ymd,
      })
      if (insErr && !insErr.message.includes('duplicate') && !insErr.code?.includes('23')) {
        throw new Error(`DB insert mislukt: ${insErr.message}`)
      }
      return email
    })
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const errors = results
    .map((r, i) => r.status === 'rejected' ? `${toSend[i].email}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` : null)
    .filter((x): x is string => x !== null)

  return NextResponse.json({
    ok: true,
    reminder_date: ymd,
    recipients: recipients.length,
    sent,
    errors: errors.length ? errors : undefined,
  })
}
