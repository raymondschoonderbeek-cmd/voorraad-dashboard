import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { berekenStatus, berekenVolgendeLabel, type BeschikbaarheidRecord, type GebruikerStatus } from '@/lib/beschikbaarheid'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const userIdsParam = searchParams.get('userIds')

  // Optionele datum: ?date=YYYY-MM-DD → bereken status om 10:00 UTC op die dag
  // (= 12:00 CEST / 11:00 CET — ruim binnen kantooruren voor EU-tijdzones)
  const dateParam = searchParams.get('date')
  const now = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? new Date(`${dateParam}T10:00:00Z`)
    : new Date()

  let query = supabase.from('gebruiker_beschikbaarheid').select('*')
  if (userIdsParam) {
    const ids = userIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 0) query = query.in('user_id', ids)
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = (rows ?? []).map(r => r.user_id as string)

  // Haal naam + afdeling op uit gebruiker_rollen.
  // Gebruik service role als beschikbaar, zodat RLS geen afdelingsdata blokkeert.
  const rollenClient = hasAdminKey() ? createAdminClient() : supabase
  const rollenResult = userIds.length > 0
    ? await rollenClient.from('gebruiker_rollen').select('user_id, naam, afdeling, office_location').in('user_id', userIds)
    : { data: [], error: null }

  // Graceful fallback als een kolom nog niet bestaat.
  let rollen: Array<{ user_id: string; naam: string | null; afdeling?: string | null; office_location?: string | null }> = []
  if (!rollenResult.error) {
    rollen = rollenResult.data ?? []
  } else {
    const msg = (rollenResult.error.message ?? '').toLowerCase()
    const kolomOntbreekt = msg.includes('column') || msg.includes('kolom')
    if (!kolomOntbreekt) {
      return NextResponse.json({ error: rollenResult.error.message }, { status: 500 })
    }
    const fallback = userIds.length > 0
      ? await rollenClient.from('gebruiker_rollen').select('user_id, naam').in('user_id', userIds)
      : { data: [], error: null }
    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    }
    rollen = (fallback.data ?? []) as Array<{ user_id: string; naam: string | null }>
  }

  const naamByUser = new Map<string, string | null>(
    rollen.map(r => [r.user_id, r.naam ?? null])
  )
  const afdelingByUser = new Map<string, string | null>(
    rollen.map(r => [r.user_id, ((r as Record<string, unknown>).afdeling as string | null) ?? null])
  )
  const officeLocationByUser = new Map<string, string | null>(
    rollen.map(r => [r.user_id, ((r as Record<string, unknown>).office_location as string | null) ?? null])
  )

  // Email lookup via admin client
  const emailByUser = new Map<string, string>()
  try {
    if (hasAdminKey() && userIds.length > 0) {
      const admin = createAdminClient()
      let page = 1
      const userIdSet = new Set(userIds)
      while (true) {
        const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
        if (!authUsers || authUsers.length === 0) break
        for (const u of authUsers) {
          if (userIdSet.has(u.id) && u.email) emailByUser.set(u.id, u.email)
        }
        if (authUsers.length < 1000) break
        page++
      }
    }
  } catch { /* optioneel */ }

  const statussen: GebruikerStatus[] = (rows ?? []).map(row => {
    const rec = row as BeschikbaarheidRecord
    const status = berekenStatus(rec, now)
    return {
      user_id: rec.user_id,
      email: emailByUser.get(rec.user_id) ?? '',
      naam: naamByUser.get(rec.user_id) ?? null,
      afdeling: afdelingByUser.get(rec.user_id) ?? null,
      office_location: officeLocationByUser.get(rec.user_id) ?? null,
      werklocatie: rec.werklocatie ?? null,
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
