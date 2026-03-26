import { createAdminClient } from '@/lib/supabase/admin'
import type { DashboardModuleId } from '@/lib/dashboard-modules'
import { resolveDashboardModules } from '@/lib/dashboard-modules'

export type LunchRecipient = { userId: string; email: string }

/**
 * Alle gebruikers met lunch-dashboardmodule en zonder reminder opt-out.
 */
export async function fetchLunchReminderRecipients(): Promise<LunchRecipient[]> {
  const admin = createAdminClient()

  const { data: rollen, error: rollenErr } = await admin
    .from('gebruiker_rollen')
    .select('user_id, rol')

  if (rollenErr) throw new Error(rollenErr.message)
  const rows = rollen ?? []
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id).filter(Boolean))]

  const { data: profRows } = await admin
    .from('profiles')
    .select('user_id, lunch_module_enabled, modules_toegang, campagne_fietsen_toegang, lunch_reminder_opt_out')
    .in('user_id', userIds)

  type ProfRow = {
    lunch_module_enabled?: boolean | null
    modules_toegang?: unknown
    campagne_fietsen_toegang?: boolean | null
    lunch_reminder_opt_out?: boolean | null
  }
  const profileByUser = new Map<string, ProfRow>()
  for (const row of profRows ?? []) {
    const uid = (row as { user_id: string }).user_id
    if (uid) profileByUser.set(uid, row as ProfRow)
  }

  const { data: emailRows, error: emailErr } = await admin.rpc('get_user_emails', {
    user_ids: userIds,
  })
  if (emailErr) throw new Error(emailErr.message)

  const emailByUser: Record<string, string> = {}
  for (const row of emailRows ?? []) {
    const uid = (row as { user_id: string }).user_id
    const email = (row as { email: string }).email
    if (uid && email) emailByUser[uid] = email
  }

  const out: LunchRecipient[] = []

  for (const r of rows) {
    const uid = (r as { user_id: string }).user_id
    const rolName = (r as { rol: string }).rol
    if (!uid) continue
    const prof = profileByUser.get(uid)
    if (prof?.lunch_reminder_opt_out === true) continue

    const modules: DashboardModuleId[] = resolveDashboardModules(
      rolName,
      prof ?? null,
      rolName === 'admin'
    )
    if (!modules.includes('lunch')) continue

    const email = emailByUser[uid]
    if (!email?.includes('@')) continue

    out.push({ userId: uid, email })
  }

  const seen = new Set<string>()
  return out.filter(x => {
    if (seen.has(x.userId)) return false
    seen.add(x.userId)
    return true
  })
}
