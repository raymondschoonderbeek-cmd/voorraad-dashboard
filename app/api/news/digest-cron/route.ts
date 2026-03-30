import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { buildDigestEmailHtml, digestMailConfigured, sendNewsDigestEmail } from '@/lib/news-digest-mail'

/**
 * GET: wekelijkse digest (cron-job.org + Authorization: Bearer CRON_SECRET).
 * Verstuurt naar gebruikers met weekly_digest_enabled (default true) een overzicht van berichten gepubliceerd in de laatste 7 dagen.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasAdminKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt.' }, { status: 503 })
  }

  if (!digestMailConfigured()) {
    return NextResponse.json(
      { error: 'Geen mail: RESEND_API_KEY of MAILGUN niet geconfigureerd.' },
      { status: 503 }
    )
  }

  const admin = createAdminClient()
  const site = getSiteUrl()
  const since = new Date()
  since.setDate(since.getDate() - 7)
  const sinceIso = since.toISOString()

  const { data: posts, error: pe } = await admin
    .from('drg_news_posts')
    .select('id, title, excerpt, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })

  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 })
  const list = posts ?? []
  if (list.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_posts_in_window', sent: 0 })
  }

  const { data: rollen, error: re } = await admin.from('gebruiker_rollen').select('user_id')
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })
  const userIds = [...new Set((rollen ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))]
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_users', sent: 0 })
  }

  const { data: prefsRows } = await admin.from('drg_news_preferences').select('user_id, weekly_digest_enabled')
  const prefOff = new Set(
    (prefsRows ?? [])
      .filter((p: { weekly_digest_enabled?: boolean }) => p.weekly_digest_enabled === false)
      .map((p: { user_id: string }) => p.user_id)
  )

  const eligible = userIds.filter(uid => !prefOff.has(uid))

  const { data: emailRows, error: ee } = await admin.rpc('get_user_emails', { user_ids: eligible })
  if (ee) return NextResponse.json({ error: ee.message }, { status: 500 })

  const emails = new Map<string, string>()
  for (const row of emailRows ?? []) {
    const uid = (row as { user_id: string }).user_id
    const em = (row as { email: string }).email?.trim()
    if (uid && em?.includes('@')) emails.set(uid, em)
  }

  const { html, text } = buildDigestEmailHtml({
    posts: list.map(p => ({
      id: p.id,
      title: p.title,
      excerpt: p.excerpt,
      published_at: p.published_at,
    })),
    siteUrl: site,
  })

  const subject = `DRG Portal — ${list.length} nieuwsbericht${list.length === 1 ? '' : 'en'} deze week`

  let sent = 0
  const errors: string[] = []
  for (const [, to] of emails) {
    try {
      await sendNewsDigestEmail({ to, subject, html, text })
      sent++
    } catch (e) {
      errors.push(`${to}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    posts_in_digest: list.length,
    recipients_attempted: emails.size,
    sent,
    errors: errors.length ? errors : undefined,
  })
}
