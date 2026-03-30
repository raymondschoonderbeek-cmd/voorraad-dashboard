import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import {
  getAmsterdamIsoWeekday,
  getAmsterdamYmd,
  isWithinReminderWindow,
  parseHHmmToMinutes,
} from '@/lib/amsterdam-time'
import {
  buildDigestEmailHtml,
  buildDigestEmailSubject,
  digestMailConfigured,
  sendNewsDigestEmail,
} from '@/lib/news-digest-mail'

/**
 * GET: wekelijkse digest (cron-job.org + Authorization: Bearer CRON_SECRET).
 * Verstuurt volgens drg_news_digest_config (weekdag, tijd Amsterdam, aan/uit).
 * Query: force=1 — dag/tijd/dedup overslaan (test).
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

  const { searchParams } = new URL(request.url)
  const forceTest = searchParams.get('force') === '1' || searchParams.get('force') === 'true'

  const admin = createAdminClient()
  const now = new Date()

  const { data: cfgRow } = await admin.from('drg_news_digest_config').select('*').eq('id', 1).maybeSingle()
  const cfg = cfgRow as {
    digest_enabled?: boolean
    digest_weekday?: number
    digest_time_local?: string
    last_digest_sent_at?: string | null
  } | null

  const digest_enabled = cfg?.digest_enabled !== false
  const weekdayCfg = Number(cfg?.digest_weekday) || 5
  const timeStr = typeof cfg?.digest_time_local === 'string' ? cfg.digest_time_local.trim() : '09:00'
  const targetMin = parseHHmmToMinutes(timeStr)

  if (!forceTest) {
    if (!digest_enabled) {
      return NextResponse.json({ ok: true, skipped: 'digest_disabled' })
    }
    if (targetMin == null) {
      return NextResponse.json({ error: 'Ongeldige digest_time_local in database' }, { status: 500 })
    }
    const isoToday = getAmsterdamIsoWeekday(now)
    if (isoToday !== weekdayCfg) {
      return NextResponse.json({
        ok: true,
        skipped: 'wrong_weekday',
        amsterdam_weekday: isoToday,
        configured: weekdayCfg,
      })
    }
    if (!isWithinReminderWindow(now, targetMin)) {
      return NextResponse.json({
        ok: true,
        skipped: 'outside_time_window',
        window_starts: timeStr,
      })
    }
    const last = cfg?.last_digest_sent_at ? new Date(cfg.last_digest_sent_at) : null
    if (last && !Number.isNaN(last.getTime()) && getAmsterdamYmd(last) === getAmsterdamYmd(now)) {
      return NextResponse.json({
        ok: true,
        skipped: 'already_sent_today',
        last_digest_sent_at: cfg?.last_digest_sent_at,
      })
    }
  }

  const site = getSiteUrl()
  const since = new Date()
  since.setDate(since.getDate() - 7)
  const sinceIso = since.toISOString()

  const { data: posts, error: pe } = await admin
    .from('drg_news_posts')
    .select('id, title, excerpt, body_html, published_at, category')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })

  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 })
  const list = posts ?? []

  const { data: afRows } = await admin
    .from('drg_news_afdelingen')
    .select('slug, label, sort_order')
    .order('sort_order', { ascending: true })

  const afdelingen = (afRows ?? []).map((r: { slug: string; label: string; sort_order: number }) => ({
    slug: r.slug,
    label: r.label,
    sort_order: r.sort_order ?? 0,
  }))

  async function markDigestRun() {
    await admin
      .from('drg_news_digest_config')
      .update({
        last_digest_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
  }

  if (list.length === 0) {
    await markDigestRun()
    return NextResponse.json({ ok: true, skipped: 'no_posts_in_window', sent: 0, force: forceTest })
  }

  const { data: rollen, error: re } = await admin.from('gebruiker_rollen').select('user_id')
  if (re) return NextResponse.json({ error: re.message }, { status: 500 })
  const userIds = [...new Set((rollen ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean))]
  if (userIds.length === 0) {
    await markDigestRun()
    return NextResponse.json({ ok: true, skipped: 'no_users', sent: 0, force: forceTest })
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
      body_html: typeof p.body_html === 'string' ? p.body_html : '',
      published_at: p.published_at,
      category: typeof p.category === 'string' && p.category.trim() ? p.category.trim() : 'algemeen',
    })),
    siteUrl: site,
    afdelingen,
  })

  const subject = buildDigestEmailSubject(now)

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

  await markDigestRun()

  return NextResponse.json({
    ok: true,
    posts_in_digest: list.length,
    recipients_attempted: emails.size,
    sent,
    errors: errors.length ? errors : undefined,
    force: forceTest,
  })
}
