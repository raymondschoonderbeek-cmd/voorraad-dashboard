import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import type { ModuleRol } from '@/lib/module-rollen'
import { MODULE_ROL_ORDER } from '@/lib/module-rollen'
import type { DashboardModuleId } from '@/lib/dashboard-modules'

/**
 * GET /api/admin/module-rollen?user_id=xxx
 * Geeft alle module-rollen voor een gebruiker terug.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const userId = request.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id vereist' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('gebruiker_module_rollen')
    .select('module, rol')
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rollen: Record<string, ModuleRol> = Object.fromEntries(
    (data ?? []).map(r => [r.module, r.rol as ModuleRol])
  )
  return NextResponse.json(rollen)
}

/**
 * PUT /api/admin/module-rollen
 * Body: { user_id, module, rol: 'viewer'|'bewerker'|'admin'|'geen' }
 * 'geen' verwijdert de rol.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  if (!hasAdminKey()) return NextResponse.json({ error: 'Configuratiefout' }, { status: 500 })

  const body = await request.json() as { user_id?: string; module?: string; rol?: string }
  const { user_id, module, rol } = body

  if (!user_id || !module) return NextResponse.json({ error: 'user_id en module vereist' }, { status: 400 })

  const admin = createAdminClient()

  if (!rol || rol === 'geen') {
    // Verwijder rol + module uit modules_toegang
    const { error: delError } = await admin
      .from('gebruiker_module_rollen')
      .delete()
      .eq('user_id', user_id)
      .eq('module', module)

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

    // Ook uit modules_toegang verwijderen
    await verwijderUitModulesToegang(admin, user_id, module as DashboardModuleId)

    return NextResponse.json({ ok: true })
  }

  if (!MODULE_ROL_ORDER.includes(rol as ModuleRol)) {
    return NextResponse.json({ error: 'Ongeldige rol' }, { status: 400 })
  }

  // Upsert module-rol
  const { error } = await admin
    .from('gebruiker_module_rollen')
    .upsert({ user_id, module, rol, updated_at: new Date().toISOString() }, { onConflict: 'user_id,module' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Voeg ook toe aan modules_toegang (voor sidebar-zichtbaarheid)
  await voegToeAanModulesToegang(admin, user_id, module as DashboardModuleId)

  return NextResponse.json({ ok: true })
}

async function voegToeAanModulesToegang(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  module: DashboardModuleId
) {
  const { data } = await admin.from('profiles').select('modules_toegang').eq('user_id', userId).maybeSingle()
  const huidigeModules: DashboardModuleId[] = Array.isArray(data?.modules_toegang) ? data.modules_toegang : []
  if (!huidigeModules.includes(module)) {
    await admin.from('profiles').upsert(
      { user_id: userId, modules_toegang: [...huidigeModules, module], updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }
}

async function verwijderUitModulesToegang(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  module: DashboardModuleId
) {
  const { data } = await admin.from('profiles').select('modules_toegang').eq('user_id', userId).maybeSingle()
  const huidigeModules: DashboardModuleId[] = Array.isArray(data?.modules_toegang) ? data.modules_toegang : []
  const nieuw = huidigeModules.filter(m => m !== module)
  if (nieuw.length !== huidigeModules.length) {
    await admin.from('profiles').upsert(
      { user_id: userId, modules_toegang: nieuw, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  }
}
