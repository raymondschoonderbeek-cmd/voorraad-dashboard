import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { berekenStatus, berekenVolgendeLabel, type BeschikbaarheidRecord, type GebruikerStatus } from '@/lib/beschikbaarheid'

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const userIdsParam = searchParams.get('userIds')

  let query = supabase.from('gebruiker_beschikbaarheid').select('*')
  if (userIdsParam) {
    const ids = userIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 0) query = query.in('user_id', ids)
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = (rows ?? []).map(r => r.user_id as string)

  const { data: rollen } = userIds.length > 0
    ? await supabase.from('gebruiker_rollen').select('user_id, naam').in('user_id', userIds)
    : { data: [] }

  const naamByUser = new Map<string, string | null>(
    (rollen ?? []).map(r => [r.user_id, r.naam ?? null])
  )

  const emailByUser = new Map<string, string>()
  try {
    const { createAdminClient, hasAdminKey } = await import('@/lib/supabase/admin')
    if (hasAdminKey() && userIds.length > 0) {
      const admin = createAdminClient()
      const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
      for (const u of authUsers ?? []) {
        if (userIds.includes(u.id) && u.email) emailByUser.set(u.id, u.email)
      }
    }
  } catch { /* optioneel */ }

  const now = new Date()
  const statussen: GebruikerStatus[] = (rows ?? []).map(row => {
    const rec = row as BeschikbaarheidRecord
    const status = berekenStatus(rec, now)
    return {
      user_id: rec.user_id,
      email: emailByUser.get(rec.user_id) ?? '',
      naam: naamByUser.get(rec.user_id) ?? null,
      status,
      oof_start: rec.oof_status === 'scheduled' ? rec.oof_start : null,
      oof_end: rec.oof_status === 'scheduled' ? rec.oof_end : null,
      work_schedule: rec.work_schedule,
      work_timezone: rec.work_timezone,
      next_available_label: berekenVolgendeLabel(rec, now),
    }
  })

  return NextResponse.json({ statussen, timestamp: now.toISOString() })
}
