import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { isDrgNewsCategory } from '@/lib/news-types'

/**
 * GET: lijst berichten (RLS: niet-admin alleen gepubliceerde).
 * Query: category, important_only=1, q=zoekterm
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')?.trim()
  const importantOnly = searchParams.get('important_only') === '1' || searchParams.get('important_only') === 'true'
  const q = searchParams.get('q')?.trim()

  let qy = supabase.from('drg_news_posts').select('*').order('published_at', { ascending: false, nullsFirst: true })

  if (category && isDrgNewsCategory(category)) {
    qy = qy.eq('category', category)
  }
  if (importantOnly) {
    qy = qy.eq('is_important', true)
  }
  if (q) {
    const safe = q.replace(/%/g, '').trim()
    if (safe) qy = qy.or(`title.ilike.%${safe}%,excerpt.ilike.%${safe}%`)
  }

  const { data, error } = await qy
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [] })
}

/**
 * POST: nieuw bericht (alleen admin).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

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
  const category =
    typeof body.category === 'string' && isDrgNewsCategory(body.category.trim())
      ? body.category.trim()
      : 'algemeen'
  const is_important = body.is_important === true
  let published_at: string | null = null
  if (typeof body.published_at === 'string' && body.published_at.trim() !== '') {
    published_at = body.published_at.trim()
  } else if (body.publish === true) {
    published_at = new Date().toISOString()
  }

  const { data, error } = await admin.supabase
    .from('drg_news_posts')
    .insert({
      title,
      body_html,
      excerpt,
      category,
      is_important,
      published_at,
      created_by: admin.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
