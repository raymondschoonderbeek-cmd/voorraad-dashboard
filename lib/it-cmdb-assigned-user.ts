import type { SupabaseClient } from '@supabase/supabase-js'

export const IT_CMDB_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Of userId een portalgebruiker is (gebruiker_rollen). Via RPC (security definer) — directe select faalt door RLS. */
export async function assertPortalUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('it_cmdb_is_valid_assigned_user', { target_user_id: userId })
  if (error) return false
  return data === true
}

/** undefined = veld niet meesturen; null = koppeling verwijderen */
export function parseAssignedUserId(
  body: Record<string, unknown>
): { ok: true; value: string | null | undefined } | { ok: false } {
  if (!('assigned_user_id' in body)) return { ok: true, value: undefined }
  const v = body.assigned_user_id
  if (v === null || v === '') return { ok: true, value: null }
  if (typeof v !== 'string') return { ok: false }
  const s = v.trim()
  if (!s) return { ok: true, value: null }
  if (!IT_CMDB_UUID_RE.test(s)) return { ok: false }
  return { ok: true, value: s }
}

export async function enrichAssignedEmails<T extends { assigned_user_id: string | null }>(
  supabase: SupabaseClient,
  rows: T[]
): Promise<(T & { assigned_user_email: string | null })[]> {
  const ids = [...new Set(rows.map(r => r.assigned_user_id).filter((x): x is string => !!x))]
  if (ids.length === 0) {
    return rows.map(r => ({ ...r, assigned_user_email: null as string | null }))
  }
  const { data: emRows, error } = await supabase.rpc('it_cmdb_resolve_user_emails', { user_ids: ids })
  if (error) {
    return rows.map(r => ({
      ...r,
      assigned_user_email: null as string | null,
    }))
  }
  const map = new Map<string, string>()
  for (const row of emRows ?? []) {
    const r = row as { user_id: string; email: string }
    if (r.user_id) map.set(r.user_id, r.email ?? '')
  }
  return rows.map(r => ({
    ...r,
    assigned_user_email: r.assigned_user_id ? map.get(r.assigned_user_id) ?? null : null,
  }))
}
