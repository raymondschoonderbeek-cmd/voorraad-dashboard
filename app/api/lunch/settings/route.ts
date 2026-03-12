import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

/** GET: lunch-instellingen (tikkie_pay_link leesbaar voor iedereen met lunch-toegang) */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const { user, supabase } = await requireAuth()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('lunch_config')
      .select('tikkie_pay_link')
      .eq('id', 1)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tikkie_pay_link: data?.tikkie_pay_link ?? '' })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij ophalen instellingen' }, { status: 500 })
  }
}

/** PATCH: lunch-instellingen bijwerken (alleen admin) */
export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })
  try {
    const body = await request.json().catch(() => ({}))
    const tikkie_pay_link = typeof body.tikkie_pay_link === 'string' ? body.tikkie_pay_link.trim() : ''

    const { error } = await admin.supabase
      .from('lunch_config')
      .update({ tikkie_pay_link, updated_at: new Date().toISOString() })
      .eq('id', 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tikkie_pay_link })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken instellingen' }, { status: 500 })
  }
}
