import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: aantal ongelezen gepubliceerde berichten voor de ingelogde gebruiker.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date().toISOString()
  const { data: posts, error: e1 } = await supabase
    .from('drg_news_posts')
    .select('id')
    .not('published_at', 'is', null)
    .lte('published_at', now)

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  const postIds = (posts ?? []).map(p => (p as { id: string }).id)
  if (postIds.length === 0) return NextResponse.json({ count: 0 })

  const { data: reads, error: e2 } = await supabase
    .from('drg_news_reads')
    .select('news_id')
    .eq('user_id', user.id)
    .in('news_id', postIds)

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  const readSet = new Set((reads ?? []).map(r => (r as { news_id: string }).news_id))
  const count = postIds.filter(id => !readSet.has(id)).length
  return NextResponse.json({ count })
}
