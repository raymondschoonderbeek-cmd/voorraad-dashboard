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
      .select('lunch_module_enabled, modules_order')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const modules_order = Array.isArray(data?.modules_order) ? data.modules_order : null
    return NextResponse.json({ lunch_module_enabled: data?.lunch_module_enabled === true, modules_order })
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
    const hasLunch = typeof body.lunch_module_enabled === 'boolean'
    const hasModulesOrder = Array.isArray(body.modules_order)

    const { data: existing } = await supabase
      .from('profiles')
      .select('lunch_module_enabled, modules_order')
      .eq('user_id', user.id)
      .maybeSingle()

    const lunch_module_enabled = hasLunch ? body.lunch_module_enabled === true : (existing?.lunch_module_enabled === true)
    const modules_order = hasModulesOrder ? body.modules_order : (Array.isArray(existing?.modules_order) ? existing.modules_order : null)

    const payload: Record<string, unknown> = { user_id: user.id, lunch_module_enabled, updated_at: new Date().toISOString() }
    if (hasModulesOrder) payload.modules_order = body.modules_order

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ lunch_module_enabled, modules_order })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken profiel' }, { status: 500 })
  }
}
