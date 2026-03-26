import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAmsterdamYmd } from '@/lib/amsterdam-time'
import { effectiveOrderDateForReminderAt, normalizeOrderEndTimeLocal } from '@/lib/lunch-order-deadline'
import { normalizeOrderWeekdays } from '@/lib/lunch-schedule'
import { fetchLunchReminderRecipients } from '@/lib/lunch-reminder-recipients'
import { formatOrderDateNl, sendLunchReminderToEmail } from '@/lib/lunch-reminder-mail'
import { isMailgunConfigured } from '@/lib/send-welcome-email'

async function resolveBroadcastOrderDate(request: NextRequest, body?: unknown): Promise<string> {
  const fromQuery = new URL(request.url).searchParams.get('orderDate')?.trim()
  if (fromQuery && /^\d{4}-\d{2}-\d{2}$/.test(fromQuery)) return fromQuery

  if (body && typeof body === 'object' && body !== null) {
    const od = (body as { orderDate?: unknown }).orderDate
    if (typeof od === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(od.trim())) return od.trim()
  }

  const client = createAdminClient()
  const { data: cfg } = await client
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
  return (
    effectiveOrderDateForReminderAt(new Date(), orderWeekdays, closedDates, endNorm) ?? getAmsterdamYmd(new Date())
  )
}

/**
 * GET: aantal lunch-herinneringsontvangers en hoeveel er nog gemaild zouden worden voor deze besteldatum (zelfde regels als cron).
 * POST: handmatig die mails versturen (alleen admins).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  const orderDate = await resolveBroadcastOrderDate(request)

  let recipients: Awaited<ReturnType<typeof fetchLunchReminderRecipients>>
  try {
    recipients = await fetchLunchReminderRecipients()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ontvangers ophalen mislukt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const client = createAdminClient()
  const { data: already } = await client
    .from('lunch_reminder_sent')
    .select('user_id')
    .eq('reminder_date', orderDate)

  const sentSet = new Set((already ?? []).map((r: { user_id: string }) => r.user_id))
  const alreadySentForDate = recipients.filter(r => sentSet.has(r.userId)).length
  const wouldSend = recipients.length - alreadySentForDate

  return NextResponse.json({
    orderDate,
    orderDatePretty: formatOrderDateNl(orderDate),
    eligibleRecipients: recipients.length,
    alreadySentForDate,
    wouldSend,
  })
}

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

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    /* leeg */
  }
  const orderDate = await resolveBroadcastOrderDate(request, body)

  let recipients: Awaited<ReturnType<typeof fetchLunchReminderRecipients>>
  try {
    recipients = await fetchLunchReminderRecipients()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ontvangers ophalen mislukt'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const client = createAdminClient()
  const { data: already } = await client
    .from('lunch_reminder_sent')
    .select('user_id')
    .eq('reminder_date', orderDate)

  const sentSet = new Set((already ?? []).map((r: { user_id: string }) => r.user_id))
  const skippedAlreadySent = recipients.filter(r => sentSet.has(r.userId)).length

  let sent = 0
  const errors: string[] = []

  for (const { userId, email, firstName } of recipients) {
    if (sentSet.has(userId)) continue
    try {
      await sendLunchReminderToEmail(email, orderDate, firstName)
      const { error: insErr } = await client.from('lunch_reminder_sent').insert({
        user_id: userId,
        reminder_date: orderDate,
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
    orderDate,
    orderDatePretty: formatOrderDateNl(orderDate),
    eligibleRecipients: recipients.length,
    sent,
    skippedAlreadySent,
    errors: errors.length ? errors : undefined,
  })
}
