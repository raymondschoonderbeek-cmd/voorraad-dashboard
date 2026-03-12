import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

/** GET: haal profiel op (lunch_module_enabled) */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('profiles')
      .select('lunch_module_enabled')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ lunch_module_enabled: data?.lunch_module_enabled === true })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij ophalen profiel' }, { status: 500 })
  }
}

/** PATCH: update profiel (lunch_module_enabled) */
export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const lunch_module_enabled = body.lunch_module_enabled === true

    const { error } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, lunch_module_enabled, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ lunch_module_enabled })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken profiel' }, { status: 500 })
  }
}
