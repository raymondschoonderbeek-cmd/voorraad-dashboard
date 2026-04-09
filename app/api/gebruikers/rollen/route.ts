import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'
import type { DashboardModuleId, LandCode } from '@/lib/dashboard-modules'
import { DASHBOARD_MODULE_ORDER, landenToegangForDb, parseModulesToegang, resolveDashboardModules } from '@/lib/dashboard-modules'

const ALL_MODULE_IDS = new Set<string>(DASHBOARD_MODULE_ORDER)

/** Filtert de body-array op geldige module-id's; geeft altijd een array terug (ook leeg). */
function parseModulesFromBody(raw: unknown, rol: string): DashboardModuleId[] | null {
  if (rol === 'lunch') return ['lunch']
  if (!Array.isArray(raw)) return null          // niet meegegeven → caller bepaalt fallback
  return raw.filter((x): x is DashboardModuleId => typeof x === 'string' && ALL_MODULE_IDS.has(x))
}

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .single()
  return data?.rol === 'admin'
}

// Update rol, naam, e-mail, modules en landen
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!await isAdmin(supabase, user.id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const body = await request.json()
  const {
    user_id,
    rol,
    naam,
    email,
    mfa_verplicht,
    modules_toegang: modulesRaw,
    landen_toegang: landenRaw,
  } = body

  const updateData: { rol: string; naam: string; mfa_verplicht?: boolean } = { rol, naam }
  if (typeof mfa_verplicht === 'boolean') updateData.mfa_verplicht = mfa_verplicht

  // Andere gebruikers dan auth.uid(): RLS laat dat vaak niet toe met de user-client.
  // Service role (zoals bij POST /api/gebruikers) is nodig voor betrouwbare rol-updates.
  const rollenClient = hasAdminKey() ? createAdminClient() : supabase
  const { data: updatedRollen, error: rollenErr } = await rollenClient
    .from('gebruiker_rollen')
    .update(updateData)
    .eq('user_id', user_id)
    .select('user_id')

  if (rollenErr) {
    return NextResponse.json(
      {
        error: rollenErr.message,
        hint: hasAdminKey()
          ? undefined
          : 'Zet SUPABASE_SERVICE_ROLE_KEY in de omgeving van de server (Vercel / .env.local) om rollen van anderen te wijzigen.',
      },
      { status: 400 }
    )
  }
  if (!updatedRollen?.length) {
    return NextResponse.json({ error: 'Geen gebruiker_rollen-rij gevonden voor dit user_id.' }, { status: 404 })
  }

  if (email != null && email.trim() !== '') {
    if (!hasAdminKey()) {
      return NextResponse.json({
        error: 'E-mail wijzigen vereist SUPABASE_SERVICE_ROLE_KEY. Voeg toe aan .env.local en herstart de server.',
      }, { status: 400 })
    }
    const adminClient = createAdminClient()
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      email: email.trim(),
      email_confirm: true,
    })
    if (updateError) {
      return NextResponse.json({
        error: updateError.message,
      }, { status: 400 })
    }
  }

  if (!hasAdminKey()) {
    return NextResponse.json({ success: true })
  }

  const adminClient = createAdminClient()
  try {
    const { data: ex } = await adminClient
      .from('profiles')
      .select('lunch_module_enabled, modules_order, modules_toegang, campagne_fietsen_toegang, landen_toegang')
      .eq('user_id', user_id)
      .maybeSingle()

    const fromBody = parseModulesFromBody(modulesRaw, rol)
    const modList: DashboardModuleId[] =
      fromBody ??
      parseModulesToegang(ex?.modules_toegang) ??
      resolveDashboardModules(rol, ex, rol === 'admin')

    let landenPayload: unknown = ex?.landen_toegang ?? null
    if (Array.isArray(landenRaw)) {
      const picked = landenRaw.filter((x: unknown): x is LandCode => x === 'Netherlands' || x === 'Belgium')
      landenPayload = landenToegangForDb(picked)
    }

    const defaultOrder = ['voorraad', 'lunch', 'brand-groep', 'campagne-fietsen', 'meer']
    const { error: profileErr } = await adminClient.from('profiles').upsert(
      {
        user_id,
        modules_toegang: modList,
        landen_toegang: landenPayload ?? null,
        lunch_module_enabled: modList.includes('lunch'),
        campagne_fietsen_toegang: modList.includes('campagne-fietsen'),
        modules_order: Array.isArray(ex?.modules_order) ? ex.modules_order : defaultOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    if (profileErr) {
      return NextResponse.json({ error: `Modules opslaan mislukt: ${profileErr.message}` }, { status: 500 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return NextResponse.json({ error: `Profiel opslaan mislukt: ${msg}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
