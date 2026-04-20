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
      .select('lunch_module_enabled, modules_order, lunch_reminder_opt_out, geboortedatum, weergave_naam')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const modules_order = Array.isArray(data?.modules_order) ? data.modules_order : null
    return NextResponse.json({
      lunch_module_enabled: data?.lunch_module_enabled === true,
      modules_order,
      lunch_reminder_opt_out: data?.lunch_reminder_opt_out === true,
      geboortedatum: data?.geboortedatum ?? null,
      weergave_naam: data?.weergave_naam ?? null,
    })
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
    const hasReminderOptOut = typeof body.lunch_reminder_opt_out === 'boolean'
    const hasGeboortedatum = 'geboortedatum' in body
    const hasWeergaveNaam = 'weergave_naam' in body

    const { data: existing } = await supabase
      .from('profiles')
      .select('lunch_module_enabled, modules_order, lunch_reminder_opt_out, geboortedatum, weergave_naam')
      .eq('user_id', user.id)
      .maybeSingle()

    const lunch_module_enabled = hasLunch ? body.lunch_module_enabled === true : (existing?.lunch_module_enabled === true)
    const modules_order = hasModulesOrder ? body.modules_order : (Array.isArray(existing?.modules_order) ? existing.modules_order : null)
    const lunch_reminder_opt_out = hasReminderOptOut
      ? body.lunch_reminder_opt_out === true
      : (existing?.lunch_reminder_opt_out === true)

    const payload: Record<string, unknown> = {
      user_id: user.id,
      lunch_module_enabled,
      lunch_reminder_opt_out,
      updated_at: new Date().toISOString(),
    }
    if (hasModulesOrder) payload.modules_order = body.modules_order
    if (hasGeboortedatum) payload.geboortedatum = body.geboortedatum || null
    if (hasWeergaveNaam) payload.weergave_naam = body.weergave_naam?.trim() || null

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const geboortedatum = hasGeboortedatum ? (body.geboortedatum || null) : (existing?.geboortedatum ?? null)
    const weergave_naam = hasWeergaveNaam ? (body.weergave_naam?.trim() || null) : (existing?.weergave_naam ?? null)
    return NextResponse.json({ lunch_module_enabled, modules_order, lunch_reminder_opt_out, geboortedatum, weergave_naam })
  } catch (err) {
    return NextResponse.json({ error: 'Fout bij bijwerken profiel' }, { status: 500 })
  }
}
