import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const JOAN_TOKEN_URL = 'https://portal.getjoan.com/api/token/'
const JOAN_PORTAL = 'https://portal.getjoan.com/api/2.0/portal'
const JOAN_V1 = 'https://portal.getjoan.com/api/v1.0'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'niet ingelogd' }, { status: 401 })

  const { data: rolData } = await supabase.from('gebruiker_rollen').select('rol').eq('user_id', user.id).single()
  if (rolData?.rol !== 'admin') return NextResponse.json({ error: 'alleen admin' }, { status: 403 })

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET
  if (!clientId || !clientSecret) return NextResponse.json({ error: 'geen JOAN credentials in env' })

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch(JOAN_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!tokenRes.ok) return NextResponse.json({ error: `token HTTP ${tokenRes.status}`, body: await tokenRes.text() })
  const { access_token: token } = await tokenRes.json()

  const now = new Date()

  // Amsterdam-tijdzone correcte daggrens (zelfde als lib/joan.ts)
  const datumAms = now.toLocaleDateString('sv', { timeZone: 'Europe/Amsterdam' })
  const ref = new Date(`${datumAms}T12:00:00Z`)
  const amsUur = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam', hour: 'numeric', hour12: false, hourCycle: 'h23',
  }).format(ref), 10)
  const offsetH = amsUur - 12
  const beginVanDag = new Date(new Date(`${datumAms}T00:00:00Z`).getTime() - offsetH * 3_600_000)
  const eindVanDag = new Date(beginVanDag.getTime() + 24 * 60 * 60 * 1000 - 1)
  const tz = 'Europe/Amsterdam'

  // Rooms ophalen
  const roomsRes = await fetch(`${JOAN_PORTAL}/rooms/`, { headers: { Authorization: `Bearer ${token}` } })
  const roomsRaw = await roomsRes.json()
  const rooms = Array.isArray(roomsRaw) ? roomsRaw : (roomsRaw.results ?? [])

  // Schedule ophalen (Amsterdam-correcte datums)
  const scheduleUrl = `${JOAN_PORTAL}/rooms/reservations/schedule/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}&tz=${encodeURIComponent(tz)}`
  const schedRes = await fetch(scheduleUrl, { headers: { Authorization: `Bearer ${token}` } })
  const schedRaw = schedRes.ok ? await schedRes.json() : null
  const schedResults: unknown[] = Array.isArray(schedRaw) ? schedRaw : (schedRaw?.results ?? [])

  // V1 events ophalen (Amsterdam-correcte datums)
  const v1Url = `${JOAN_V1}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`
  const v1Res = await fetch(v1Url, { headers: { Authorization: `Bearer ${token}` } })
  const v1Raw = v1Res.ok ? await v1Res.json() : null
  const v1Results: unknown[] = Array.isArray(v1Raw) ? v1Raw : (v1Raw?.results ?? [])

  // Eerste V1-event-object volledig uitpakken voor veldanalyse
  const eersteV1Groep = v1Results[0] as Record<string, unknown> | undefined
  const eersteV1Event = eersteV1Groep
    ? (Array.isArray(eersteV1Groep.events) ? eersteV1Groep.events[0] : null)
    : null

  // Alle V1 events samenvatten per ruimte
  const v1PerRuimte = v1Results.map(g => {
    if (!g || typeof g !== 'object') return null
    const gr = g as Record<string, unknown>
    const room = (gr.room ?? gr.space ?? {}) as Record<string, unknown>
    const evts = Array.isArray(gr.events) ? gr.events : []
    return {
      room_email: room.email,
      room_name: room.name,
      events_count: evts.length,
      events: evts.map((e: unknown) => {
        if (!e || typeof e !== 'object') return e
        return e
      }),
    }
  })

  // Schedule-items samenvatten
  const schedPerRuimte = schedResults.map(g => {
    if (!g || typeof g !== 'object') return null
    const gr = g as Record<string, unknown>
    const room = (gr.room ?? gr.space ?? {}) as Record<string, unknown>
    const sched = Array.isArray(gr.schedule) ? gr.schedule : []
    return {
      room_email: room.email,
      room_name: room.name,
      schedule_count: sched.length,
      schedule_first: sched[0] ?? null,
    }
  })

  return NextResponse.json({
    now: now.toISOString(),
    datumAms,
    beginVanDag: beginVanDag.toISOString(),
    eindVanDag: eindVanDag.toISOString(),
    offsetH,
    rooms_count: rooms.length,

    // Schedule endpoint
    schedule_status: schedRes.status,
    schedule_total_rooms: schedResults.length,
    schedule_per_ruimte: schedPerRuimte,

    // V1 endpoint
    v1_status: v1Res.status,
    v1_total_rooms: v1Results.length,
    eerste_v1_event_keys: eersteV1Event && typeof eersteV1Event === 'object' ? Object.keys(eersteV1Event as object) : null,
    eerste_v1_event_volledig: eersteV1Event,
    v1_per_ruimte: v1PerRuimte,
  })
}
