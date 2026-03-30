import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { isDrgNewsCategory } from '@/lib/news-types'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const { data, error } = await supabase.from('drg_news_posts').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ post: data })
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') update.title = body.title.trim()
  if (typeof body.body_html === 'string') update.body_html = body.body_html
  if (typeof body.excerpt === 'string') update.excerpt = body.excerpt.trim() || null
  if (typeof body.category === 'string' && isDrgNewsCategory(body.category.trim())) {
    update.category = body.category.trim()
  }
  if (typeof body.is_important === 'boolean') update.is_important = body.is_important
  if (body.publish === true && !body.published_at) {
    update.published_at = new Date().toISOString()
  } else if (body.published_at === null) {
    update.published_at = null
  } else if (typeof body.published_at === 'string') {
    update.published_at = body.published_at
  }

  const { data, error } = await auth.supabase
    .from('drg_news_posts')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json({ post: data })
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { id } = await ctx.params
  const { error } = await auth.supabase.from('drg_news_posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
