import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import {
  getAmsterdamHourMinute,
  getAmsterdamIsoWeekday,
  getAmsterdamYmd,
  isWithinReminderWindow,
  parseHHmmToMinutes,
} from '@/lib/amsterdam-time'
import { WEEKDAYS_NL, checkOrderDateAllowed, normalizeOrderWeekdays } from '@/lib/lunch-schedule'
import { fetchLunchReminderRecipients } from '@/lib/lunch-reminder-recipients'
import { isMailgunConfigured } from '@/lib/send-welcome-email'

export type CronReadinessCheck = {
  id: string
  ok: boolean
  title: string
  detail?: string
}

function weekdayLabel(iso: number): string {
  return WEEKDAYS_NL.find(w => w.iso === iso)?.label ?? `dag ${iso}`
}

/**
 * Zelfde voorwaarden als GET /api/lunch/reminder-cron (productie), zonder te versturen.
 */
export async function getReminderCronReadiness(now = new Date()): Promise<{
  checks: CronReadinessCheck[]
  /** Zou de cron nu géén vroege skip geven en mails proberen te versturen? */
  wouldRunSendLoop: boolean
  amsterdam: {
    ymd: string
    isoWeekday: number
    weekdayLabel: string
    time: string
  }
  configured: {
    reminder_weekday: number
    reminder_weekday_label: string
    reminder_time_local: string
  }
  recipientCount: number | null
  pendingSendCount: number | null
  alreadySentToday: number | null
  error?: string
}> {
  const checks: CronReadinessCheck[] = []
  const push = (id: string, ok: boolean, title: string, detail?: string) => {
    checks.push({ id, ok, title, detail })
  }

  if (!hasAdminKey()) {
    push('service_role', false, 'SUPABASE_SERVICE_ROLE_KEY', 'Ontbreekt — nodig voor magic links en cron')
    return {
      checks,
      wouldRunSendLoop: false,
      amsterdam: emptyAmsterdam(now),
      configured: emptyCfg(),
      recipientCount: null,
      pendingSendCount: null,
      alreadySentToday: null,
      error: 'service_role',
    }
  }
  push('service_role', true, 'SUPABASE_SERVICE_ROLE_KEY', 'Aanwezig')

  if (!isMailgunConfigured()) {
    push('mailgun', false, 'Mailgun', 'Zet MAILGUN_API_KEY en MAILGUN_DOMAIN (zoals welkomstmail)')
    return {
      checks,
      wouldRunSendLoop: false,
      amsterdam: emptyAmsterdam(now),
      configured: emptyCfg(),
      recipientCount: null,
      pendingSendCount: null,
      alreadySentToday: null,
      error: 'mailgun',
    }
  }
  push('mailgun', true, 'Mailgun', 'Geconfigureerd')

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    push('admin_client', false, 'Admin client', msg)
    return {
      checks,
      wouldRunSendLoop: false,
      amsterdam: emptyAmsterdam(now),
      configured: emptyCfg(),
      recipientCount: null,
      pendingSendCount: null,
      alreadySentToday: null,
      error: 'admin_client',
    }
  }

  const { data: cfg, error: cfgErr } = await admin
    .from('lunch_config')
    .select(
      'reminder_mail_enabled, reminder_weekday, reminder_time_local, order_weekdays, closed_dates'
    )
    .eq('id', 1)
    .single()

  if (cfgErr || !cfg) {
    push('lunch_config', false, 'lunch_config', cfgErr?.message ?? 'Geen rij')
    return {
      checks,
      wouldRunSendLoop: false,
      amsterdam: emptyAmsterdam(now),
      configured: emptyCfg(),
      recipientCount: null,
      pendingSendCount: null,
      alreadySentToday: null,
      error: 'lunch_config',
    }
  }
  push('lunch_config', true, 'Database lunch_config', 'OK')

  const ymd = getAmsterdamYmd(now)
  const isoToday = getAmsterdamIsoWeekday(now)
  const { hour, minute } = getAmsterdamHourMinute(now)
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const wLabel = weekdayLabel(isoToday)

  const weekdayCfg = Number(cfg.reminder_weekday)
  const cfgWeekLabel = weekdayLabel(
    Number.isInteger(weekdayCfg) && weekdayCfg >= 1 && weekdayCfg <= 7 ? weekdayCfg : 5
  )
  const timeCfg = typeof cfg.reminder_time_local === 'string' ? cfg.reminder_time_local : '08:00'

  if (!cfg.reminder_mail_enabled) {
    push('reminder_enabled', false, 'Herinneringen in beheer', 'Staat uit — zet “Herinneringen versturen” aan')
  } else {
    push('reminder_enabled', true, 'Herinneringen in beheer', 'Staat aan')
  }

  if (isoToday !== weekdayCfg) {
    push(
      'weekday',
      false,
      'Weekdag (Amsterdam)',
      `Vandaag is ${wLabel}; mail staat op ${cfgWeekLabel}`
    )
  } else {
    push('weekday', true, 'Weekdag (Amsterdam)', `Vandaag: ${wLabel} — komt overeen`)
  }

  const targetMin = parseHHmmToMinutes(timeCfg)
  if (targetMin == null) {
    push('time_valid', false, 'Ingestelde tijd', `Ongeldig: ${timeCfg}`)
  } else {
    push('time_valid', true, 'Ingestelde tijd', timeCfg)
    if (!isWithinReminderWindow(now, targetMin)) {
      push(
        'time_window',
        false,
        '5-minuten venster na ingestelde tijd',
        `Nu ${timeStr} (Amsterdam). Venster start om ${timeCfg} en duurt 5 min. — cron moet in dat venster pingen.`
      )
    } else {
      push('time_window', true, '5-minuten venster na ingestelde tijd', `Nu binnen venster na ${timeCfg}`)
    }
  }

  const orderWeekdays = normalizeOrderWeekdays(cfg.order_weekdays) ?? [1, 2, 3, 4, 5]
  const closedRaw = cfg.closed_dates
  const closedDates: string[] = Array.isArray(closedRaw)
    ? closedRaw.map((x: unknown) => String(x).slice(0, 10))
    : []
  const dateCheck = checkOrderDateAllowed(ymd, orderWeekdays, closedDates)
  if (!dateCheck.ok) {
    push('order_day', false, 'Bestellen mogelijk vandaag', dateCheck.description)
  } else {
    push('order_day', true, 'Bestellen mogelijk vandaag', `Datum ${ymd} is toegestaan`)
  }

  let recipientCount: number | null = null
  let pendingSendCount: number | null = null
  let alreadySentToday: number | null = null

  try {
    const recipients = await fetchLunchReminderRecipients()
    recipientCount = recipients.length

    const { data: already } = await admin
      .from('lunch_reminder_sent')
      .select('user_id')
      .eq('reminder_date', ymd)

    const sentSet = new Set((already ?? []).map((r: { user_id: string }) => r.user_id))
    alreadySentToday = sentSet.size
    const pending = recipients.filter(r => !sentSet.has(r.userId))
    pendingSendCount = pending.length

    if (recipientCount === 0) {
      push(
        'recipients',
        true,
        'Ontvangers (lunch-module)',
        'Nog geen gebruikers met lunch-module (of allemaal opt-out)'
      )
    } else {
      push(
        'recipients',
        true,
        'Ontvangers (lunch-module)',
        `${recipientCount} gebruiker(s); ${pendingSendCount} nog geen mail vandaag (${ymd}), ${alreadySentToday} al verstuurd`
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    push('recipients', false, 'Ontvangers ophalen', msg)
  }

  const wouldRunSendLoop = checks.every(c => c.ok)

  return {
    checks,
    wouldRunSendLoop,
    amsterdam: {
      ymd,
      isoWeekday: isoToday,
      weekdayLabel: wLabel,
      time: timeStr,
    },
    configured: {
      reminder_weekday: weekdayCfg,
      reminder_weekday_label: cfgWeekLabel,
      reminder_time_local: timeCfg,
    },
    recipientCount,
    pendingSendCount,
    alreadySentToday,
  }
}

function emptyAmsterdam(now: Date) {
  const ymd = getAmsterdamYmd(now)
  const isoToday = getAmsterdamIsoWeekday(now)
  const { hour, minute } = getAmsterdamHourMinute(now)
  return {
    ymd,
    isoWeekday: isoToday,
    weekdayLabel: weekdayLabel(isoToday),
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

function emptyCfg() {
  return {
    reminder_weekday: 5,
    reminder_weekday_label: weekdayLabel(5),
    reminder_time_local: '08:00',
  }
}
