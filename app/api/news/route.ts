import { NextRequest, NextResponse } from 'next/server'
import { canManageInterneNieuws, requireAuth, requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { isValidNewsAfdelingSlug } from '@/lib/news-afdelingen'

/**
 * GET: lijst berichten.
 * Standaard (zonder beheer=1): alleen live gepubliceerde berichten (published_at ≤ nu), ook voor beheerders —
 * het teamoverzicht toont geen concepten of toekomstige planning.
 * Query beheer=1: alle berichten (incl. concept & gepland), alleen voor nieuwsbeheerders.
 * Overige query: category, important_only=1, q=zoekterm
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const beheer = searchParams.get('beheer') === '1' || searchParams.get('beheer') === 'true'
  const category = searchParams.get('category')?.trim()
  const importantOnly = searchParams.get('important_only') === '1' || searchParams.get('important_only') === 'true'
  const q = searchParams.get('q')?.trim()
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 1), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0)

  if (beheer && !(await canManageInterneNieuws(supabase, user.id))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  let qy = supabase
    .from('drg_news_posts')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false, nullsFirst: true })

  if (!beheer) {
    const nowIso = new Date().toISOString()
    qy = qy.not('published_at', 'is', null).lte('published_at', nowIso)
  }

  if (category && (await isValidNewsAfdelingSlug(supabase, category))) {
    qy = qy.eq('category', category)
  }
  if (importantOnly) {
    qy = qy.eq('is_important', true)
  }
  if (q) {
    const safe = q.replace(/%/g, '').trim()
    if (safe) qy = qy.or(`title.ilike.%${safe}%,excerpt.ilike.%${safe}%`)
  }

  const { data, error, count } = await qy.range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const total = count ?? 0
  return NextResponse.json({ posts: data ?? [], total, hasMore: offset + limit < total })
}

/**
 * POST: nieuw bericht (admin of interne-nieuws-module).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is verplicht' }, { status: 400 })

  const body_html = typeof body.body_html === 'string' ? body.body_html : ''
  const excerpt = typeof body.excerpt === 'string' ? body.excerpt.trim() || null : null

  let category = 'algemeen'
  if (typeof body.category === 'string') {
    const c = body.category.trim()
    if (c && (await isValidNewsAfdelingSlug(auth.supabase, c))) category = c
    else {
      const { data: first } = await auth.supabase
        .from('drg_news_afdelingen')
        .select('slug')
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (first?.slug) category = first.slug
    }
  }
  const is_important = body.is_important === true
  const toon_op_tv = body.toon_op_tv === true
  let published_at: string | null = null
  if (typeof body.published_at === 'string' && body.published_at.trim() !== '') {
    published_at = body.published_at.trim()
  } else if (body.publish === true) {
    published_at = new Date().toISOString()
  }

  const { data, error } = await auth.supabase
    .from('drg_news_posts')
    .insert({
      title,
      body_html,
      excerpt,
      category,
      is_important,
      toon_op_tv,
      published_at,
      created_by: auth.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
