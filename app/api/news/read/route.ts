import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * POST: markeer bericht als gelezen. Body: { news_id: uuid }
 * DELETE: markeer als ongelezen (verwijdert read-rij).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { news_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const news_id = typeof body.news_id === 'string' ? body.news_id.trim() : ''
  if (!news_id) return NextResponse.json({ error: 'news_id verplicht' }, { status: 400 })

  const row = { user_id: user.id, news_id, read_at: new Date().toISOString() }
  const { error } = await supabase.from('drg_news_reads').insert(row)

  if (error) {
    const dup = error.code === '23505' || error.message?.toLowerCase().includes('duplicate')
    if (!dup) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const news_id = new URL(request.url).searchParams.get('news_id')?.trim()
  if (!news_id) return NextResponse.json({ error: 'news_id query verplicht' }, { status: 400 })

  const { error } = await supabase.from('drg_news_reads').delete().eq('user_id', user.id).eq('news_id', news_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
