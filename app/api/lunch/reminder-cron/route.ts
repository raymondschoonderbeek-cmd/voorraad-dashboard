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
import { checkOrderDateAllowed, normalizeOrderWeekdays } from '@/lib/lunch-schedule'
import { fetchLunchReminderRecipients } from '@/lib/lunch-reminder-recipients'
import { sendLunchReminderToEmail } from '@/lib/lunch-reminder-mail'
import { isMailgunConfigured } from '@/lib/send-welcome-email'

/**
 * GET: aanroepen door scheduler (cron-job.org elke 5 min) met Authorization: Bearer CRON_SECRET
 * Vercel Hobby heeft geen ingebouwde cron — gebruik externe scheduler.
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

  const now = new Date()
  const admin = createAdminClient()

  const { data: cfg, error: cfgErr } = await admin
    .from('lunch_config')
    .select(
      'reminder_mail_enabled, reminder_weekday, reminder_time_local, order_weekdays, closed_dates'
    )
    .eq('id', 1)
    .single()

  if (cfgErr || !cfg) {
    return NextResponse.json({ error: cfgErr?.message ?? 'Geen lunch_config' }, { status: 500 })
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

  const ymd = getAmsterdamYmd(now)
  const orderWeekdays = normalizeOrderWeekdays(cfg.order_weekdays) ?? [1, 2, 3, 4, 5]
  const closedRaw = cfg.closed_dates
  const closedDates: string[] = Array.isArray(closedRaw)
    ? closedRaw.map((x: unknown) => String(x).slice(0, 10))
    : []

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

  let sent = 0
  const errors: string[] = []

  for (const { userId, email } of recipients) {
    if (sentSet.has(userId)) continue
    try {
      await sendLunchReminderToEmail(email, ymd)
      const { error: insErr } = await admin.from('lunch_reminder_sent').insert({
        user_id: userId,
        reminder_date: ymd,
      })
      if (insErr) {
        if (!insErr.message.includes('duplicate') && !insErr.code?.includes('23')) {
          errors.push(`${email}: ${insErr.message}`)
        }
      } else {
        sent++
        sentSet.add(userId)
      }
    } catch (e) {
      errors.push(`${email}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    reminder_date: ymd,
    recipients: recipients.length,
    sent,
    errors: errors.length ? errors : undefined,
  })
}
