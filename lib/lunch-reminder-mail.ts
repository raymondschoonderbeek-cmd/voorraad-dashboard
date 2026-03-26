import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { sendMailgunHtmlEmail } from '@/lib/send-welcome-email'
import { formatOrderEndTimeNl, normalizeOrderEndTimeLocal } from '@/lib/lunch-order-deadline'

/** Supabase: "For security purposes, you can only request this after 26 seconds." */
function parseMagicLinkRateLimitWaitMs(message: string): number | null {
  const m = /after (\d+)\s*seconds/i.exec(message)
  if (m) return (parseInt(m[1], 10) + 1) * 1000
  return null
}

const MAGIC_LINK_MAX_ATTEMPTS = 6

/**
 * Magic link voor lunchmail; bij rate limit wacht de foutmelding het aantal seconden + 1s en opnieuw proberen.
 */
async function generateLunchMagicLink(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  redirectTo: string
): Promise<string> {
  const addr = email.trim().toLowerCase()
  for (let attempt = 0; attempt < MAGIC_LINK_MAX_ATTEMPTS; attempt++) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: addr,
      options: { redirectTo },
    })
    if (!error) {
      const actionLink = (data as { properties?: { action_link?: string } })?.properties?.action_link
      if (actionLink) return actionLink
      throw new Error('Geen magic link ontvangen van Supabase')
    }
    const msg = error.message ?? ''
    const waitMs = parseMagicLinkRateLimitWaitMs(msg)
    if (waitMs != null && attempt < MAGIC_LINK_MAX_ATTEMPTS - 1) {
      await new Promise<void>(resolve => {
        setTimeout(resolve, waitMs)
      })
      continue
    }
    throw new Error(msg)
  }
  throw new Error('Magic link genereren mislukt na meerdere pogingen')
}

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

/** Placeholders: {{loginMagicUrl}} = portal-login om zelf inloglink aan te vragen; {{actionLink}}/{{magicLink}} = directe magic link (alleen als beheer die gebruikt). */
export const LUNCH_REMINDER_PLACEHOLDER_HELP =
  '{{prettyDate}}, {{orderDateYmd}}, {{orderEndTime}}, {{orderEndTimePretty}}, {{eindTijd}}, {{eindTijdUur}}, {{voornaam}}, {{firstName}}, {{loginMagicUrl}}, {{actionLink}}, {{magicLink}}, {{siteUrl}}, {{settingsUrl}}'

export function defaultReminderSubjectTemplate(): string {
  return 'Lunch: bestel je broodje voor {{prettyDate}} (uiterlijk {{eindTijd}} op die dag)'
}

/** Link naar /login (magic link-modus, next=lunch, e-mail ingevuld) — gebruiker klikt “Stuur inloglink” en ontvangt daarna de echte magic link per mail. */
export function buildLunchLoginMagicRequestUrl(site: string, orderDateYmd: string, email: string): string {
  const base = site.replace(/\/$/, '')
  const next = `/dashboard/lunch?orderDate=${encodeURIComponent(orderDateYmd)}`
  const q = new URLSearchParams()
  q.set('magic', '1')
  q.set('next', next)
  q.set('email', email.trim().toLowerCase())
  return `${base}/login?${q.toString()}`
}

function templateUsesServerGeneratedMagicLink(
  subjectTpl: string | null | undefined,
  htmlTpl: string | null | undefined
): boolean {
  const sub = subjectTpl?.trim() ?? ''
  const html = htmlTpl?.trim() ?? ''
  const s = `${sub}\n${html}`
  return s.includes('{{actionLink}}') || s.includes('{{magicLink}}')
}

export function buildLunchReminderHtml(opts: {
  prettyDate: string
  orderEndTimePretty: string
  settingsUrl: string
  loginMagicUrl: string
  /** Eerste woord van gebruiker_rollen.naam; leeg = “Beste collega,” */
  firstName?: string
}) {
  const { prettyDate, orderEndTimePretty, settingsUrl, loginMagicUrl, firstName } = opts
  const greeting =
    firstName?.trim() ? `Beste ${escapeHtml(firstName.trim())},` : 'Beste collega,'
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1e293b;">
  <p>${greeting}</p>
  <p>Vergeet niet je broodje voor de lunch te bestellen voor <strong>${escapeHtml(prettyDate)}</strong>.</p>
  <p style="font-size: 14px; color: #334155;">Je kunt nog bestellen tot <strong>${escapeHtml(orderEndTimePretty)}</strong> op die dag (Europe/Amsterdam).</p>
  <p>
    <a href="${escapeHtml(loginMagicUrl)}" style="display:inline-block; padding: 12px 20px; background: #2D457C; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">
      Naar inloggen — vraag inloglink aan
    </a>
  </p>
  <p style="font-size: 13px; color: #64748b;">Je gaat naar de inlogpagina (je e-mail staat al ingevuld). Klik op <strong>Stuur inloglink</strong>; je ontvangt daarna een tweede e-mail met de echte inloglink — geen wachtwoord nodig. Na inloggen kom je op de lunchpagina voor deze besteldag.</p>
  <p style="font-size: 12px; color: #64748b; margin-top: 1.25em;">
    <a href="${escapeHtml(settingsUrl)}" style="color: #475569; text-decoration: underline;">Afmelden voor lunch-herinneringsmails</a>
    <span style="color: #94a3b8;"> — na inloggen kun je dit onder Instellingen uitzetten.</span>
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
  /** Portal-login om OTP/magic link aan te vragen (standaard in de mail). */
  loginMagicUrl: string
  /** Alleen ingevuld als template {{actionLink}}/{{magicLink}} gebruikt; anders leeg. */
  actionLink: string
  siteUrl: string
  /** Volledige URL naar portalinstellingen (herinneringen uit) */
  settingsUrl: string
}

/** Vervangt placeholders; URL-placeholders (magic link) worden niet ge-escaped. */
function applyPlaceholders(template: string, vars: ReminderVars, escapeValues: boolean): string {
  const {
    prettyDate,
    orderDateYmd,
    orderEndTime,
    orderEndTimePretty,
    firstName,
    loginMagicUrl,
    actionLink,
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
    '{{loginMagicUrl}}': escapeValues ? escapeHtml(loginMagicUrl) : loginMagicUrl,
    '{{actionLink}}': actionLink,
    '{{magicLink}}': actionLink,
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
        loginMagicUrl: vars.loginMagicUrl,
        firstName: vars.firstName,
      })

  return { subject, html }
}

/**
 * Genereert magic link en verstuurt herinneringsmail (template uit lunch_config indien gezet).
 */
export async function sendLunchReminderToEmail(
  email: string,
  orderDateYmd: string,
  firstName?: string
): Promise<void> {
  const admin = createAdminClient()
  const site = getSiteUrl()
  const nextPath = `/dashboard/lunch?orderDate=${encodeURIComponent(orderDateYmd)}`
  const redirectTo = `${site}/auth/callback?next=${encodeURIComponent(nextPath)}`

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
  const loginMagicUrl = buildLunchLoginMagicRequestUrl(site, orderDateYmd, email)

  const needServerLink = templateUsesServerGeneratedMagicLink(
    cfg?.reminder_mail_subject ?? null,
    cfg?.reminder_mail_html ?? null
  )
  const actionLink = needServerLink ? await generateLunchMagicLink(admin, email, redirectTo) : ''

  const fn = firstName?.trim() ?? ''
  const vars: ReminderVars = {
    prettyDate,
    orderDateYmd,
    orderEndTime,
    orderEndTimePretty,
    firstName: fn,
    loginMagicUrl,
    actionLink,
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
