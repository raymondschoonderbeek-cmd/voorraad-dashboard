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
