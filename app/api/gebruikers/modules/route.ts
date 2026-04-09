import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import type { DashboardModuleId } from '@/lib/dashboard-modules'
import { DASHBOARD_MODULE_ORDER } from '@/lib/dashboard-modules'

const ALL_MODULE_IDS = new Set<string>(DASHBOARD_MODULE_ORDER)

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

/** Bulk modules opslaan voor meerdere gebruikers tegelijk.
 *  Body: { updates: { user_id: string, modules_toegang: DashboardModuleId[] }[] }
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'Bulk module update vereist SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 400 }
    )
  }

  const body = await request.json()
  const { updates } = body as { updates?: unknown }

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'Geen updates opgegeven.' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()
  const defaultOrder = ['voorraad', 'lunch', 'brand-groep', 'campagne-fietsen', 'meer']

  const errors: string[] = []
  let succeeded = 0

  for (const upd of updates) {
    if (!upd || typeof upd !== 'object') continue
    const { user_id, modules_toegang } = upd as Record<string, unknown>
    if (typeof user_id !== 'string' || !Array.isArray(modules_toegang)) continue

    const modList = modules_toegang.filter(
      (x): x is DashboardModuleId => typeof x === 'string' && ALL_MODULE_IDS.has(x)
    )

    try {
      const { data: ex } = await adminClient
        .from('profiles')
        .select('modules_order')
        .eq('user_id', user_id)
        .maybeSingle()

      const { error } = await adminClient.from('profiles').upsert(
        {
          user_id,
          modules_toegang: modList,
          lunch_module_enabled: modList.includes('lunch'),
          campagne_fietsen_toegang: modList.includes('campagne-fietsen'),
          modules_order: Array.isArray(ex?.modules_order) ? ex.modules_order : defaultOrder,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )

      if (error) {
        errors.push(`${user_id}: ${error.message}`)
      } else {
        succeeded++
      }
    } catch (e) {
      errors.push(`${user_id}: ${e instanceof Error ? e.message : 'Onbekende fout'}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, succeeded, errors, message: `${succeeded}/${updates.length} updates geslaagd.` },
      { status: errors.length === updates.length ? 500 : 207 }
    )
  }

  return NextResponse.json({ success: true, succeeded })
}
