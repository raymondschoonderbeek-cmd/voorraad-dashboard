import { sendMailgunHtmlEmail, isMailgunConfigured } from '@/lib/send-welcome-email'

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? 'DRG Portal'

/** Typische nieuwsbrief-kop zoals in Dynamo Weekly (aanpasbaar via env). */
const DIGEST_HEADER_LINE = process.env.NEXT_PUBLIC_DIGEST_NEWSLETTER_TITLE?.trim() || 'Dynamo Weekly'
const DIGEST_BRAND_PRIMARY = process.env.NEXT_PUBLIC_DIGEST_BRAND_LINE1?.trim() || 'DYNAMO'
const DIGEST_BRAND_SECONDARY = process.env.NEXT_PUBLIC_DIGEST_BRAND_LINE2?.trim() || 'RETAIL GROUP'

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const COLOR_PAGE = '#121212'
const COLOR_BANNER = '#1a365d'
const COLOR_TEXT = '#ffffff'
const COLOR_TEXT_MUTED = '#e2e8f0'

/** ISO 8601 weeknummer (1–53), voor o.a. onderwerpregel en banner. */
export function getDigestIsoWeek(date: Date = new Date()): number {
  const target = new Date(date.valueOf())
  const dayNr = (date.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

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

export type DigestEmailPost = {
  id: string
  title: string
  excerpt: string | null
  published_at: string | null
  /** Slug van drg_news_afdelingen */
  category: string
}

export type DigestAfdelingMeta = {
  slug: string
  label: string
  sort_order: number
}

function labelForSlug(slug: string, afdelingen: DigestAfdelingMeta[]): string {
  const row = afdelingen.find(a => a.slug === slug)
  return row?.label ?? slug
}

function orderedCategorySlugs(posts: DigestEmailPost[], afdelingen: DigestAfdelingMeta[]): string[] {
  const seen = new Set<string>()
  for (const p of posts) seen.add(p.category || 'algemeen')
  const orderMap = new Map(afdelingen.map(a => [a.slug, a.sort_order]))
  return [...seen].sort((a, b) => {
    const oa = orderMap.get(a) ?? 9999
    const ob = orderMap.get(b) ?? 9999
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })
}

export function buildDigestEmailHtml(opts: {
  posts: DigestEmailPost[]
  siteUrl: string
  afdelingen: DigestAfdelingMeta[]
  /** Voor weeknummer in banner (bijv. testen) */
  now?: Date
}): { html: string; text: string } {
  const base = opts.siteUrl.replace(/\/$/, '')
  const now = opts.now ?? new Date()
  const week = getDigestIsoWeek(now)
  const topLine = `${DIGEST_HEADER_LINE} | Week ${week}`

  const posts = opts.posts
  const afdelingen = opts.afdelingen
  const slugs = orderedCategorySlugs(posts, afdelingen)

  const blocksHtml: string[] = []
  const blocksText: string[] = []

  if (posts.length === 0) {
    blocksHtml.push(
      `<p style="margin:0;font-size:15px;line-height:1.6;color:${COLOR_TEXT_MUTED};font-family:${FONT_STACK};">Geen nieuwsberichten in de afgelopen 7 dagen.</p>`
    )
    blocksText.push('Geen nieuwsberichten in de afgelopen 7 dagen.', '')
  } else {
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i]
      const label = escapeHtml(labelForSlug(slug, afdelingen))
      const group = posts.filter(p => (p.category || 'algemeen') === slug)
      const marginTop = i === 0 ? '0' : '36px'

      blocksHtml.push(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${marginTop};margin-bottom:8px;">
  <tr>
    <td>
      <h2 style="margin:0;font-size:22px;font-weight:700;color:${COLOR_TEXT};font-family:${FONT_STACK};letter-spacing:0.02em;">${label}</h2>
    </td>
  </tr>
</table>`)

      blocksText.push('', `${labelForSlug(slug, afdelingen)}`, '─'.repeat(Math.min(40, labelForSlug(slug, afdelingen).length + 4)))

      for (const p of group) {
        const url = `${base}/dashboard/nieuws/${p.id}`
        const title = escapeHtml(p.title)
        const ex = p.excerpt?.trim()
        blocksHtml.push(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
  <tr>
    <td style="padding:0;">
      <a href="${url}" style="font-size:16px;font-weight:700;color:${COLOR_TEXT};text-decoration:none;line-height:1.4;font-family:${FONT_STACK};border-bottom:1px solid rgba(255,255,255,0.25);">${title}</a>
      ${
        ex
          ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:${COLOR_TEXT_MUTED};font-family:${FONT_STACK};">${escapeHtml(ex)}</p>`
          : ''
      }
    </td>
  </tr>
</table>`)

        blocksText.push('', p.title, ex ? ex : '', url, '')
      }
    }
  }

  const innerContent = blocksHtml.join('\n')

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(topLine)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR_PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR_PAGE};">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
        <tr>
          <td style="background-color:${COLOR_BANNER};padding:36px 28px 40px;text-align:center;">
            <p style="margin:0 0 20px;font-size:12px;letter-spacing:0.12em;color:${COLOR_TEXT};font-family:${FONT_STACK};text-transform:none;">${escapeHtml(
              topLine
            )}</p>
            <p style="margin:0;font-size:34px;font-weight:800;letter-spacing:0.04em;color:${COLOR_TEXT};font-family:${FONT_STACK};line-height:1;">${escapeHtml(
              DIGEST_BRAND_PRIMARY
            )}</p>
            <p style="margin:10px 0 0;font-size:13px;font-weight:400;letter-spacing:0.42em;color:${COLOR_TEXT};font-family:${FONT_STACK};line-height:1.2;">${escapeHtml(
              DIGEST_BRAND_SECONDARY
            )}</p>
            <p style="margin:22px 0 0;font-size:11px;font-weight:600;letter-spacing:0.28em;color:${COLOR_TEXT};font-family:${FONT_STACK};">WEEK UPDATE</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 40px;color:${COLOR_TEXT};font-family:${FONT_STACK};">
            ${innerContent}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.12);">
              <tr>
                <td>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:rgba(255,255,255,0.55);font-family:${FONT_STACK};">
                    <a href="${base}/dashboard/nieuws" style="color:#93c5fd;text-decoration:underline;">Alle berichten in ${escapeHtml(APP)} →</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  const text = [
    topLine,
    '',
    DIGEST_BRAND_PRIMARY,
    DIGEST_BRAND_SECONDARY,
    'WEEK UPDATE',
    '',
    ...blocksText,
    `Alle berichten: ${base}/dashboard/nieuws`,
  ]
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')

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

/** Onderwerpregel in dezelfde stijl als de banner (Dynamo Weekly | Week n). */
export function buildDigestEmailSubject(date: Date = new Date()): string {
  const week = getDigestIsoWeek(date)
  return `${DIGEST_HEADER_LINE} | Week ${week}`
}
