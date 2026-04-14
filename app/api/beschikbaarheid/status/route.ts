import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { berekenStatus, type BeschikbaarheidRecord, type GebruikerStatus } from '@/lib/beschikbaarheid'

/**
 * GET /api/beschikbaarheid/status
 * Geeft de berekende beschikbaarheidsstatus voor gebruikers.
 * Optioneel: ?userIds=uuid1,uuid2  (anders: alle gebruikers met een rij)
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const userIdsParam = searchParams.get('userIds')

  // Haal beschikbaarheidsinstellingen op
  let query = supabase.from('gebruiker_beschikbaarheid').select('*')
  if (userIdsParam) {
    const ids = userIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 0) query = query.in('user_id', ids)
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Haal naam + email op via gebruiker_rollen voor alle user_ids
  const userIds = (rows ?? []).map(r => r.user_id as string)
  const { data: rollen } = userIds.length > 0
    ? await supabase
        .from('gebruiker_rollen')
        .select('user_id, naam')
        .in('user_id', userIds)
    : { data: [] }

  const naamByUser = new Map<string, string | null>()
  for (const r of rollen ?? []) {
    naamByUser.set(r.user_id, r.naam ?? null)
  }

  // Haal emails op via admin-client als beschikbaar
  let emailByUser = new Map<string, string>()
  try {
    const { createAdminClient, hasAdminKey } = await import('@/lib/supabase/admin')
    if (hasAdminKey() && userIds.length > 0) {
      const admin = createAdminClient()
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
      for (const u of authUsers ?? []) {
        if (userIds.includes(u.id) && u.email) {
          emailByUser.set(u.id, u.email)
        }
      }
    }
  } catch {
    // Admin-client optioneel
  }

  const now = new Date()
  const statussen: GebruikerStatus[] = (rows ?? []).map(row => {
    const rec = row as BeschikbaarheidRecord
    return {
      user_id: rec.user_id,
      email: emailByUser.get(rec.user_id) ?? '',
      naam: naamByUser.get(rec.user_id) ?? null,
      status: berekenStatus(rec, now),
      oof_end: rec.oof_status === 'scheduled' ? rec.oof_end : null,
      work_start_time: rec.work_start_time,
      work_end_time: rec.work_end_time,
      work_days: rec.work_days,
    }
  })

  return NextResponse.json({ statussen, timestamp: now.toISOString() })
}
