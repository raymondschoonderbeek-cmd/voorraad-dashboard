import { NextRequest, NextResponse } from 'next/server'
import { requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { getSiteUrl } from '@/lib/site-url'
import { buildDigestEmailHtml } from '@/lib/news-digest-mail'

/**
 * GET: zelfde berichtenselectie als de wekelijkse digest (laatste 7 dagen, gepubliceerd),
 * voor preview in het portaal. Alleen nieuwsbeheerders.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const since = new Date()
  since.setDate(since.getDate() - 7)
  const sinceIso = since.toISOString()
  const nowIso = new Date().toISOString()

  const { data: posts, error } = await auth.supabase
    .from('drg_news_posts')
    .select('id, title, excerpt, published_at, category')
    .not('published_at', 'is', null)
    .lte('published_at', nowIso)
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = posts ?? []

  const { data: afRows } = await auth.supabase
    .from('drg_news_afdelingen')
    .select('slug, label, sort_order')
    .order('sort_order', { ascending: true })

  const afdelingen = (afRows ?? []).map((r: { slug: string; label: string; sort_order: number }) => ({
    slug: r.slug,
    label: r.label,
    sort_order: r.sort_order ?? 0,
  }))

  const site = getSiteUrl()
  const { html, text } = buildDigestEmailHtml({
    posts: list.map(p => ({
      id: p.id,
      title: p.title,
      excerpt: p.excerpt,
      published_at: p.published_at,
      category: typeof p.category === 'string' && p.category.trim() ? p.category.trim() : 'algemeen',
    })),
    siteUrl: site,
    afdelingen,
  })

  return NextResponse.json({
    html,
    text,
    post_count: list.length,
    posts: list.map(p => ({ id: p.id, title: p.title })),
  })
}
