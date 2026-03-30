import { sendMailgunHtmlEmail, isMailgunConfigured } from '@/lib/send-welcome-email'

const APP = process.env.NEXT_PUBLIC_APP_NAME ?? 'DRG Portal'

/** Typische nieuwsbrief-kop zoals in Dynamo Weekly (aanpasbaar via env). */
const DIGEST_HEADER_LINE = process.env.NEXT_PUBLIC_DIGEST_NEWSLETTER_TITLE?.trim() || 'Dynamo Weekly'
const DIGEST_BRAND_PRIMARY = process.env.NEXT_PUBLIC_DIGEST_BRAND_LINE1?.trim() || 'DYNAMO'
const DIGEST_BRAND_SECONDARY = process.env.NEXT_PUBLIC_DIGEST_BRAND_LINE2?.trim() || 'RETAIL GROUP'

const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Pagina-achtergrond (lichtgrijs) */
const COLOR_PAGE = '#f3f4f6'
/** Dunne bovenbalk */
const COLOR_TOPBAR_BG = '#e5e7eb'
const COLOR_TOPBAR_TEXT = '#64748b'
/** Banner */
const COLOR_BANNER = '#1a365d'
const COLOR_BANNER_TEXT = '#ffffff'
const COLOR_RETAIL_SUB = '#cbd5e1'
/** Inhoud op wit */
const COLOR_CONTENT_BG = '#ffffff'
const COLOR_HEADING = '#1e293b'
const COLOR_BODY = '#334155'
const COLOR_LINK = '#1a365d'

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
  /** Volledige HTML-inhoud van het bericht (zoals in het portaal). */
  body_html: string
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

/** Verwijdert riskante fragmenten uit door beheerders ingevoerde HTML (e-mail is geen volledige browser). */
export function sanitizeDigestBodyHtml(html: string): string {
  let s = html.trim()
  if (!s) return ''
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  s = s.replace(/<\/?(?:iframe|object|embed|form|meta|link)\b[^>]*>/gi, '')
  s = s.replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  s = s.replace(/javascript:/gi, '')
  return s
}

function htmlToPlainText(html: string): string {
  const s = sanitizeDigestBodyHtml(html)
  const rough = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeBasicEntities(rough)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

function articleBodyForEmail(p: DigestEmailPost): string {
  const raw = p.body_html?.trim()
  if (raw) return sanitizeDigestBodyHtml(raw)
  const ex = p.excerpt?.trim()
  if (ex) return `<p>${escapeHtml(ex)}</p>`
  return '<p style="margin:0;color:#94a3b8;font-style:italic;">(Geen inhoud)</p>'
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
      `<p style="margin:0;font-size:15px;line-height:1.6;color:${COLOR_BODY};font-family:${FONT_STACK};">Geen nieuwsberichten in de afgelopen 7 dagen.</p>`
    )
    blocksText.push('Geen nieuwsberichten in de afgelopen 7 dagen.', '')
  } else {
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i]
      const labelEscaped = escapeHtml(labelForSlug(slug, afdelingen))
      const group = posts.filter(p => (p.category || 'algemeen') === slug)
      const marginTop = i === 0 ? '0' : '40px'

      blocksHtml.push(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:${marginTop};margin-bottom:12px;">
  <tr>
    <td>
      <h2 style="margin:0;font-size:24px;font-weight:700;color:${COLOR_HEADING};font-family:${FONT_STACK};letter-spacing:-0.02em;">${labelEscaped}</h2>
    </td>
  </tr>
</table>`)

      blocksText.push('', labelForSlug(slug, afdelingen), '─'.repeat(Math.min(36, labelForSlug(slug, afdelingen).length + 2)))

      for (const p of group) {
        const url = `${base}/dashboard/nieuws/${p.id}`
        const title = escapeHtml(p.title)
        const bodyHtml = articleBodyForEmail(p)

        blocksHtml.push(`
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
  <tr>
    <td style="padding:0;">
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;line-height:1.35;font-family:${FONT_STACK};">
        <a href="${url}" style="color:${COLOR_HEADING};text-decoration:none;border-bottom:1px solid rgba(26,54,93,0.25);">${title}</a>
      </p>
      <div class="digest-body" style="font-size:15px;line-height:1.65;color:${COLOR_BODY};font-family:${FONT_STACK};">
        ${bodyHtml}
      </div>
      <p style="margin:14px 0 0;font-size:13px;font-family:${FONT_STACK};">
        <a href="${url}" style="color:${COLOR_LINK};font-weight:600;">Openen in ${escapeHtml(APP)} →</a>
      </p>
    </td>
  </tr>
</table>`)

        const plainBody = htmlToPlainText(p.body_html?.trim() ? p.body_html : p.excerpt ?? '')
        blocksText.push('', p.title, plainBody ? plainBody : '', url, '')
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
<style type="text/css">
.digest-body p { margin: 0 0 14px; }
.digest-body p:last-child { margin-bottom: 0; }
.digest-body ul, .digest-body ol { margin: 8px 0 14px; padding-left: 22px; }
.digest-body li { margin: 4px 0; }
.digest-body img { max-width: 100% !important; height: auto !important; border-radius: 6px; }
.digest-body a { color: ${COLOR_LINK}; font-weight: 600; }
.digest-body h1, .digest-body h2, .digest-body h3, .digest-body h4 { font-size: 16px; margin: 16px 0 8px; color: ${COLOR_HEADING}; font-weight: 700; }
.digest-body blockquote { margin: 12px 0; padding-left: 14px; border-left: 3px solid #cbd5e1; color: #475569; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLOR_PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR_PAGE};">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background-color:${COLOR_CONTENT_BG};">
        <tr>
          <td style="background-color:${COLOR_TOPBAR_BG};padding:10px 16px;text-align:center;border-bottom:1px solid #d1d5db;">
            <p style="margin:0;font-size:12px;letter-spacing:0.06em;color:${COLOR_TOPBAR_TEXT};font-family:${FONT_STACK};">${escapeHtml(topLine)}</p>
          </td>
        </tr>
        <tr>
          <td style="background-color:${COLOR_BANNER};padding:32px 28px 36px;text-align:center;">
            <p style="margin:0;font-size:32px;font-weight:800;letter-spacing:0.04em;color:${COLOR_BANNER_TEXT};font-family:${FONT_STACK};line-height:1;">${escapeHtml(
              DIGEST_BRAND_PRIMARY
            )}</p>
            <p style="margin:8px 0 0;font-size:13px;font-weight:400;letter-spacing:0.38em;color:${COLOR_RETAIL_SUB};font-family:${FONT_STACK};line-height:1.2;">${escapeHtml(
              DIGEST_BRAND_SECONDARY
            )}</p>
            <p style="margin:20px 0 0;font-size:11px;font-weight:600;letter-spacing:0.26em;color:${COLOR_BANNER_TEXT};font-family:${FONT_STACK};">WEEK UPDATE</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px 36px;background-color:${COLOR_CONTENT_BG};">
            ${innerContent}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;padding-top:24px;border-top:1px solid #e2e8f0;">
              <tr>
                <td>
                  <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;font-family:${FONT_STACK};">
                    <a href="${base}/dashboard/nieuws" style="color:${COLOR_LINK};text-decoration:underline;">Alle berichten in ${escapeHtml(APP)} →</a>
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
