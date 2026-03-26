import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { sendMailgunHtmlEmail } from '@/lib/send-welcome-email'
import { formatOrderEndTimeNl, normalizeOrderEndTimeLocal } from '@/lib/lunch-order-deadline'

export function formatOrderDateNl(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** Placeholders voor onderwerp en HTML (beheer) */
export const LUNCH_REMINDER_PLACEHOLDER_HELP =
  '{{prettyDate}}, {{orderDateYmd}}, {{orderEndTime}}, {{orderEndTimePretty}}, {{actionLink}}, {{siteUrl}}'

export function defaultReminderSubjectTemplate(): string {
  return 'Lunch: bestel je broodje voor {{prettyDate}}'
}

export function buildLunchReminderHtml(opts: {
  orderDateYmd: string
  actionLink: string
  prettyDate: string
  orderEndTimePretty: string
}) {
  const { actionLink, prettyDate, orderEndTimePretty } = opts
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1e293b;">
  <p>Beste collega,</p>
  <p>Vergeet niet je broodje voor de lunch te bestellen voor <strong>${escapeHtml(prettyDate)}</strong>.</p>
  <p style="font-size: 14px; color: #334155;">Je kunt nog bestellen tot <strong>${escapeHtml(orderEndTimePretty)}</strong> op die dag (Europe/Amsterdam).</p>
  <p>
    <a href="${escapeHtml(actionLink)}" style="display:inline-block; padding: 12px 20px; background: #2D457C; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">
      Inloggen en bestellen
    </a>
  </p>
  <p style="font-size: 13px; color: #64748b;">Deze link opent het portaal; je wordt veilig ingelogd (eenmalige link).</p>
  <p style="font-size: 12px; color: #94a3b8;">Geen lunch meer nodig? Zet herinneringen uit onder Instellingen in het portaal.</p>
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
  actionLink: string
  siteUrl: string
}

/** Vervangt placeholders; waarden in HTML worden ge-escaped behalve actionLink (URL) en ruwe HTML van gebruiker template */
function applyPlaceholders(template: string, vars: ReminderVars, escapeValues: boolean): string {
  const { prettyDate, orderDateYmd, orderEndTime, orderEndTimePretty, actionLink, siteUrl } = vars
  const map: Record<string, string> = {
    '{{prettyDate}}': escapeValues ? escapeHtml(prettyDate) : prettyDate,
    '{{orderDateYmd}}': escapeValues ? escapeHtml(orderDateYmd) : orderDateYmd,
    '{{orderEndTime}}': escapeValues ? escapeHtml(orderEndTime) : orderEndTime,
    '{{orderEndTimePretty}}': escapeValues ? escapeHtml(orderEndTimePretty) : orderEndTimePretty,
    '{{actionLink}}': actionLink,
    '{{siteUrl}}': escapeValues ? escapeHtml(siteUrl) : siteUrl,
  }
  let out = template
  for (const [key, val] of Object.entries(map)) {
    out = out.split(key).join(val)
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
        orderDateYmd: vars.orderDateYmd,
        actionLink: vars.actionLink,
        prettyDate: vars.prettyDate,
        orderEndTimePretty: vars.orderEndTimePretty,
      })

  return { subject, html }
}

/**
 * Genereert magic link en verstuurt herinneringsmail (template uit lunch_config indien gezet).
 */
export async function sendLunchReminderToEmail(email: string, orderDateYmd: string): Promise<void> {
  const admin = createAdminClient()
  const site = getSiteUrl()
  const nextPath = `/dashboard/lunch?orderDate=${encodeURIComponent(orderDateYmd)}`
  const redirectTo = `${site}/auth/callback?next=${encodeURIComponent(nextPath)}`

  const { data: cfg } = await admin
    .from('lunch_config')
    .select('reminder_mail_subject, reminder_mail_html, order_end_time_local')
    .eq('id', 1)
    .maybeSingle()

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.trim().toLowerCase(),
    options: { redirectTo },
  })

  if (error) throw new Error(error.message)
  const actionLink = (data as { properties?: { action_link?: string } })?.properties?.action_link
  if (!actionLink) throw new Error('Geen magic link ontvangen van Supabase')

  const prettyDate = formatOrderDateNl(orderDateYmd)
  const orderEndTime = normalizeOrderEndTimeLocal(
    typeof cfg?.order_end_time_local === 'string' ? cfg.order_end_time_local : null
  )
  const orderEndTimePretty = formatOrderEndTimeNl(orderEndTime)
  const vars: ReminderVars = {
    prettyDate,
    orderDateYmd,
    orderEndTime,
    orderEndTimePretty,
    actionLink,
    siteUrl: site,
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
