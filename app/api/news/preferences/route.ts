import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: digest-voorkeur (default true als nog geen rij).
 * PUT: { weekly_digest_enabled: boolean }
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('drg_news_preferences')
    .select('weekly_digest_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  const weekly_digest_enabled = data?.weekly_digest_enabled !== false
  return NextResponse.json({ weekly_digest_enabled })
}

export async function PUT(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { weekly_digest_enabled?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const weekly_digest_enabled = body.weekly_digest_enabled === true
  const { error } = await supabase.from('drg_news_preferences').upsert(
    {
      user_id: user.id,
      weekly_digest_enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weekly_digest_enabled })
}
