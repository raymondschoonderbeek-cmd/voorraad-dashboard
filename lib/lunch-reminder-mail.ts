import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { sendMailgunHtmlEmail } from '@/lib/send-welcome-email'

export function formatOrderDateNl(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function buildLunchReminderHtml(opts: { orderDateYmd: string; actionLink: string; prettyDate: string }) {
  const { actionLink, prettyDate } = opts
  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1e293b;">
  <p>Beste collega,</p>
  <p>Vergeet niet vandaag (<strong>${prettyDate}</strong>) je broodje voor de lunch te bestellen.</p>
  <p>
    <a href="${actionLink}" style="display:inline-block; padding: 12px 20px; background: #2D457C; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600;">
      Inloggen en bestellen
    </a>
  </p>
  <p style="font-size: 13px; color: #64748b;">Deze link opent het portaal; je wordt veilig ingelogd (eenmalige link).</p>
  <p style="font-size: 12px; color: #94a3b8;">Geen lunch meer nodig? Zet herinneringen uit onder Instellingen in het portaal.</p>
</body>
</html>`
}

/**
 * Genereert magic link en verstuurt herinneringsmail. Gooit bij Mailgun/Supabase-fouten.
 */
export async function sendLunchReminderToEmail(email: string, orderDateYmd: string): Promise<void> {
  const admin = createAdminClient()
  const site = getSiteUrl()
  const nextPath = `/dashboard/lunch?orderDate=${encodeURIComponent(orderDateYmd)}`
  const redirectTo = `${site}/auth/callback?next=${encodeURIComponent(nextPath)}`

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.trim().toLowerCase(),
    options: { redirectTo },
  })

  if (error) throw new Error(error.message)
  const actionLink = (data as { properties?: { action_link?: string } })?.properties?.action_link
  if (!actionLink) throw new Error('Geen magic link ontvangen van Supabase')

  const prettyDate = formatOrderDateNl(orderDateYmd)
  const html = buildLunchReminderHtml({ orderDateYmd, actionLink, prettyDate })

  await sendMailgunHtmlEmail({
    to: email.trim(),
    subject: `Lunch: bestel je broodje voor ${prettyDate}`,
    html,
  })
}
