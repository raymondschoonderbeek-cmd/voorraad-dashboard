import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { sendMailgunHtmlEmail } from '@/lib/send-welcome-email'
import { formatOrderEndTimeNl, normalizeOrderEndTimeLocal } from '@/lib/lunch-order-deadline'

export function formatOrderDateNl(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Eerste woord van volledige naam (gebruiker_rollen.naam); leeg als onbekend. */
export function voornaamUitVolledigeNaam(naam: string | null | undefined): string {
  const t = naam?.trim()
  if (!t) return ''
  return t.split(/\s+/)[0] ?? ''
}

/** {{loginUrl}} = inlogpagina (e-mail vooringevuld, na login lunch voor die dag). {{loginMagicUrl}}/{{actionLink}}/{{magicLink}} = zelfde link (legacy alias). */
export const LUNCH_REMINDER_PLACEHOLDER_HELP =
  '{{prettyDate}}, {{orderDateYmd}}, {{orderEndTime}}, {{orderEndTimePretty}}, {{eindTijd}}, {{eindTijdUur}}, {{voornaam}}, {{firstName}}, {{loginUrl}}, {{loginMagicUrl}}, {{siteUrl}}, {{settingsUrl}}'

export function defaultReminderSubjectTemplate(): string {
  return 'Lunch: bestel je broodje voor {{prettyDate}} (uiterlijk {{eindTijd}} op die dag)'
}

/** Link naar /login met next=lunch en e-mail vooringevuld — inloggen met wachtwoord (geen magic link). */
export function buildLunchLoginUrl(site: string, orderDateYmd: string, email: string): string {
  const base = site.replace(/\/$/, '')
  const next = `/dashboard/lunch?orderDate=${encodeURIComponent(orderDateYmd)}`
  const q = new URLSearchParams()
  q.set('next', next)
  q.set('email', email.trim().toLowerCase())
  return `${base}/login?${q.toString()}`
}

export function buildLunchReminderHtml(opts: {
  prettyDate: string
  orderEndTimePretty: string
  settingsUrl: string
  loginUrl: string
  /** Eerste woord van gebruiker_rollen.naam; leeg = “Beste collega,” */
  firstName?: string
}) {
  const { prettyDate, orderEndTimePretty, settingsUrl, loginUrl, firstName } = opts
  const greeting =
    firstName?.trim() ? `Beste ${escapeHtml(firstName.trim())},` : 'Beste collega,'
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1e293b;">
  <p>${greeting}</p>
  <p>Vergeet niet je broodje voor de lunch te bestellen voor <strong>${escapeHtml(prettyDate)}</strong>.</p>
  <p style="font-size: 14px; color: #334155;">Je kunt nog bestellen tot <strong>${escapeHtml(orderEndTimePretty)}</strong> op die dag (Europe/Amsterdam).</p>
  <p>
    <a href="${escapeHtml(loginUrl)}" style="display:inline-block; padding: 12px 20px; background: #2D457C; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">
      Inloggen op DRG Portal
    </a>
  </p>
  <p style="font-size: 13px; color: #64748b;">Log in met je <strong>e-mailadres en wachtwoord</strong>. Je e-mail staat al ingevuld; na inloggen ga je direct naar de lunchpagina voor deze besteldag.</p>
  <p style="font-size: 12px; color: #64748b; margin-top: 1.25em;">
    <a href="${escapeHtml(settingsUrl)}" style="color: #475569; text-decoration: underline;">Afmelden voor lunch-herinneringsmails</a>
    <span style="color: #94a3b8;"> — na inloggen kun je dit onder Mijn instellingen uitzetten.</span>
  </p>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type ReminderVars = {
  prettyDate: string
  orderDateYmd: string
  orderEndTime: string
  orderEndTimePretty: string
  /** Eerste woord van gebruiker_rollen.naam; leeg als onbekend. */
  firstName: string
  /** Portal-login (wachtwoord); {{loginMagicUrl}}/{{actionLink}}/{{magicLink}} = dezelfde URL (legacy). */
  loginUrl: string
  siteUrl: string
  /** Volledige URL naar portalinstellingen (herinneringen uit) */
  settingsUrl: string
}

/** Vervangt placeholders; URL-placeholders worden niet ge-escaped. */
function applyPlaceholders(template: string, vars: ReminderVars, escapeValues: boolean): string {
  const {
    prettyDate,
    orderDateYmd,
    orderEndTime,
    orderEndTimePretty,
    firstName,
    loginUrl,
    siteUrl,
    settingsUrl,
  } = vars
  const map: Record<string, string> = {
    '{{prettyDate}}': escapeValues ? escapeHtml(prettyDate) : prettyDate,
    '{{orderDateYmd}}': escapeValues ? escapeHtml(orderDateYmd) : orderDateYmd,
    '{{orderEndTime}}': escapeValues ? escapeHtml(orderEndTime) : orderEndTime,
    '{{orderEndTimePretty}}': escapeValues ? escapeHtml(orderEndTimePretty) : orderEndTimePretty,
    // NL-stuurcodes (zelfde waarden als orderEndTime*)
    '{{eindTijd}}': escapeValues ? escapeHtml(orderEndTimePretty) : orderEndTimePretty,
    '{{eindTijdUur}}': escapeValues ? escapeHtml(orderEndTime) : orderEndTime,
    '{{voornaam}}': escapeValues ? escapeHtml(firstName) : firstName,
    '{{firstName}}': escapeValues ? escapeHtml(firstName) : firstName,
    '{{loginUrl}}': escapeValues ? escapeHtml(loginUrl) : loginUrl,
    '{{loginMagicUrl}}': escapeValues ? escapeHtml(loginUrl) : loginUrl,
    '{{actionLink}}': loginUrl,
    '{{magicLink}}': loginUrl,
    '{{siteUrl}}': escapeValues ? escapeHtml(siteUrl) : siteUrl,
    '{{settingsUrl}}': escapeValues ? escapeHtml(settingsUrl) : settingsUrl,
  }
  let out = template
  const keys = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    out = out.split(key).join(map[key]!)
  }
  return out
}

/**
 * Bouwt onderwerp + HTML uit DB-templates of standaarden.
 * Custom HTML uit beheer wordt als bedoelde markup beschouwd; alleen placeholders worden ingevuld.
 */
export function buildLunchReminderFromTemplates(
  subjectTpl: string | null | undefined,
  htmlTpl: string | null | undefined,
  vars: ReminderVars
): { subject: string; html: string } {
  const subRaw = subjectTpl?.trim() ? subjectTpl.trim() : defaultReminderSubjectTemplate()
  const subject = applyPlaceholders(subRaw, vars, true)

  const htmlRaw = htmlTpl?.trim()
  const html = htmlRaw
    ? applyPlaceholders(htmlRaw, vars, false)
    : buildLunchReminderHtml({
        prettyDate: vars.prettyDate,
        orderEndTimePretty: vars.orderEndTimePretty,
        settingsUrl: vars.settingsUrl,
        loginUrl: vars.loginUrl,
        firstName: vars.firstName,
      })

  return { subject, html }
}

/**
 * Verstuurt herinneringsmail (template uit lunch_config indien gezet); link naar login met wachtwoord.
 */
export async function sendLunchReminderToEmail(
  email: string,
  orderDateYmd: string,
  firstName?: string
): Promise<void> {
  const admin = createAdminClient()
  const site = getSiteUrl()

  const { data: cfg } = await admin
    .from('lunch_config')
    .select('reminder_mail_subject, reminder_mail_html, order_end_time_local')
    .eq('id', 1)
    .maybeSingle()

  const prettyDate = formatOrderDateNl(orderDateYmd)
  const orderEndTime = normalizeOrderEndTimeLocal(
    typeof cfg?.order_end_time_local === 'string' ? cfg.order_end_time_local : null
  )
  const orderEndTimePretty = formatOrderEndTimeNl(orderEndTime)
  const settingsUrl = `${site.replace(/\/$/, '')}/dashboard/instellingen`
  const loginUrl = buildLunchLoginUrl(site, orderDateYmd, email)

  const fn = firstName?.trim() ?? ''
  const vars: ReminderVars = {
    prettyDate,
    orderDateYmd,
    orderEndTime,
    orderEndTimePretty,
    firstName: fn,
    loginUrl,
    siteUrl: site,
    settingsUrl,
  }

  const { subject, html } = buildLunchReminderFromTemplates(
    cfg?.reminder_mail_subject ?? null,
    cfg?.reminder_mail_html ?? null,
    vars
  )

  await sendMailgunHtmlEmail({
    to: email.trim(),
    subject,
    html,
  })
}
