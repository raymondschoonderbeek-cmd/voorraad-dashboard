import { createClient } from '@/lib/supabase/server'
import { resolveDashboardModules, type ProfileModuleInput } from '@/lib/dashboard-modules'

export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, supabase, isAdmin: false }
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()
  const isAdmin = data?.rol === 'admin'
  return { user, supabase, isAdmin }
}

export async function requireAdmin() {
  const { user, supabase, isAdmin } = await requireAuth()
  if (!user) return { ok: false as const, status: 401 }
  if (!isAdmin) return { ok: false as const, status: 403 }
  return { ok: true as const, user, supabase }
}

/** Admin of dashboardmodule interne-nieuws (plaatsen/bewerken interne berichten). */
export async function canManageInterneNieuws(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data: rol } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle()
  if (rol?.rol === 'admin') return true
  const { data: profile } = await supabase
    .from('profiles')
    .select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang')
    .eq('user_id', userId)
    .maybeSingle()
  const modules = resolveDashboardModules(rol?.rol, profile as ProfileModuleInput | null, false)
  return modules.includes('interne-nieuws')
}

export async function requireInterneNieuwsBeheer() {
  const { user, supabase, isAdmin } = await requireAuth()
  if (!user) return { ok: false as const, status: 401 }
  if (isAdmin) return { ok: true as const, user, supabase }
  if (await canManageInterneNieuws(supabase, user.id)) return { ok: true as const, user, supabase }
  return { ok: false as const, status: 403 }
}

export type NewsPermission = {
  canManage: boolean
  /** Mag alle afdelingen zien/bewerken (admin of nieuws-redacteur module). */
  alleAfdelingen: boolean
  /** Eigen afdeling van de gebruiker (uit Azure sync), of null. */
  eigenAfdeling: string | null
}

/**
 * Bepaal nieuwsrechten voor een gebruiker:
 * - admin → alles
 * - nieuws-redacteur module → alle afdelingen zien/bewerken
 * - interne-nieuws module → alleen eigen afdeling
 */
export async function getNewsPermission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<NewsPermission> {
  const { data: rolData } = await supabase
    .from('gebruiker_rollen')
    .select('rol, afdeling')
    .eq('user_id', userId)
    .maybeSingle()

  if (rolData?.rol === 'admin') {
    return { canManage: true, alleAfdelingen: true, eigenAfdeling: rolData.afdeling ?? null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang')
    .eq('user_id', userId)
    .maybeSingle()

  const modules = resolveDashboardModules(rolData?.rol, profile as ProfileModuleInput | null, false)
  const canManage = modules.includes('interne-nieuws') || modules.includes('nieuws-redacteur')
  const alleAfdelingen = modules.includes('nieuws-redacteur')
  const eigenAfdeling = (rolData?.afdeling as string | null | undefined) ?? null

  return { canManage, alleAfdelingen, eigenAfdeling }
}

/** Admin of dashboardmodule it-cmdb (IT-hardware CMDB). */
export async function canAccessItCmdb(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data: rol } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle()
  if (rol?.rol === 'admin') return true
  const { data: profile } = await supabase
    .from('profiles')
    .select('modules_toegang, lunch_module_enabled, campagne_fietsen_toegang')
    .eq('user_id', userId)
    .maybeSingle()
  const modules = resolveDashboardModules(rol?.rol, profile as ProfileModuleInput | null, false)
  return modules.includes('it-cmdb')
}

export async function requireItCmdbAccess() {
  const { user, supabase } = await requireAuth()
  if (!user) return { ok: false as const, status: 401 }
  if (await canAccessItCmdb(supabase, user.id)) return { ok: true as const, user, supabase }
  return { ok: false as const, status: 403 }
}

/**
 * Geeft de winkel-IDs terug waartoe de gebruiker GEEN toegang heeft.
 * (gebruiker_winkels = uitsluitingen: record aanwezig = geen toegang)
 */
export async function getUserUitgeslotenWinkelIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number[]> {
  const { data } = await supabase
    .from('gebruiker_winkels')
    .select('winkel_id')
    .eq('user_id', userId)
  return (data ?? []).map((r: { winkel_id: number }) => r.winkel_id)
}

/** Admin of expliciete toegang in profiles.campagne_fietsen_toegang */
export async function canAccessCampagneFietsen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<boolean> {
  const { data: rol } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle()
  if (rol?.rol === 'admin') return true
  const { data: profile } = await supabase
    .from('profiles')
    .select('campagne_fietsen_toegang')
    .eq('user_id', userId)
    .maybeSingle()
  return profile?.campagne_fietsen_toegang === true
}
