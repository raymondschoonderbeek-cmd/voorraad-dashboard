import { sendMailgunHtmlEmail, isMailgunConfigured } from '@/lib/send-welcome-email'

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? 'DRG Portal'

/** Resend: zet RESEND_API_KEY en optioneel RESEND_FROM (bijv. Nieuws <nieuws@jouwdomein.nl>). */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

/**
 * Wekelijkse digest: eerst Resend als RESEND_API_KEY gezet is, anders Mailgun als die geconfigureerd is.
 */
export async function sendNewsDigestEmail(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const fromResend = process.env.RESEND_FROM_EMAIL?.trim() ?? `${APP} <onboarding@resend.dev>`

  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromResend,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Resend: ${res.status} ${err}`)
    }
    return
  }

  if (isMailgunConfigured()) {
    await sendMailgunHtmlEmail({
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    })
    return
  }

  throw new Error(
    'Geen mailprovider: zet RESEND_API_KEY (+ RESEND_FROM_EMAIL) of MAILGUN_API_KEY + MAILGUN_DOMAIN'
  )
}

export function buildDigestEmailHtml(opts: {
  posts: { id: string; title: string; excerpt: string | null; published_at: string | null }[]
  siteUrl: string
}): { html: string; text: string } {
  const base = opts.siteUrl.replace(/\/$/, '')
  const list = opts.posts
    .map(
      p =>
        `<li style="margin-bottom:12px;"><a href="${base}/dashboard/nieuws/${p.id}" style="color:#2D457C;font-weight:600;">${escapeHtml(
          p.title
        )}</a>${p.excerpt ? `<br/><span style="color:#64748b;font-size:14px;">${escapeHtml(p.excerpt)}</span>` : ''}</li>`
    )
    .join('')

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:18px;color:#2D457C;">${APP} — nieuws van deze week</h1>
  <p style="color:#64748b;font-size:14px;">Bekijk het volledige bericht in het portaal.</p>
  <ul style="padding-left:20px;margin:16px 0;">${list}</ul>
  <p style="margin-top:24px;font-size:13px;"><a href="${base}/dashboard/nieuws" style="color:#2D457C;">Alle berichten →</a></p>
</body></html>`

  const text = [
    `${APP} — nieuws van deze week`,
    '',
    ...opts.posts.map(p => `- ${p.title} ${base}/dashboard/nieuws/${p.id}`),
    '',
    `Alle berichten: ${base}/dashboard/nieuws`,
  ].join('\n')

  return { html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function digestMailConfigured(): boolean {
  return isResendConfigured() || isMailgunConfigured()
}
