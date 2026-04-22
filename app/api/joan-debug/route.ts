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
  const beginVanDag = new Date(); beginVanDag.setHours(0, 0, 0, 0)
  const eindVanDag = new Date(); eindVanDag.setHours(23, 59, 59, 999)
  const tz = 'Europe/Amsterdam'

  // Rooms ophalen
  const roomsRes = await fetch(`${JOAN_PORTAL}/rooms/`, { headers: { Authorization: `Bearer ${token}` } })
  const roomsRaw = await roomsRes.json()
  const rooms = Array.isArray(roomsRaw) ? roomsRaw : (roomsRaw.results ?? [])

  // Schedule ophalen
  const scheduleUrl = `${JOAN_PORTAL}/rooms/reservations/schedule/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}&tz=${encodeURIComponent(tz)}`
  const schedRes = await fetch(scheduleUrl, { headers: { Authorization: `Bearer ${token}` } })
  const schedRaw = schedRes.ok ? await schedRes.json() : null

  // V1 events ophalen als fallback
  const v1Url = `${JOAN_V1}/events/?start=${beginVanDag.toISOString()}&end=${eindVanDag.toISOString()}`
  const v1Res = await fetch(v1Url, { headers: { Authorization: `Bearer ${token}` } })
  const v1Raw = v1Res.ok ? await v1Res.json() : null

  return NextResponse.json({
    now: now.toISOString(),
    beginVanDag: beginVanDag.toISOString(),
    eindVanDag: eindVanDag.toISOString(),
    rooms_count: rooms.length,
    rooms_sample: rooms.slice(0, 3),
    schedule_status: schedRes.status,
    schedule_type: Array.isArray(schedRaw) ? 'array' : (schedRaw ? typeof schedRaw : 'null'),
    schedule_keys: schedRaw && typeof schedRaw === 'object' ? Object.keys(schedRaw) : null,
    schedule_length: Array.isArray(schedRaw) ? schedRaw.length : (schedRaw?.results?.length ?? null),
    schedule_first: Array.isArray(schedRaw) ? schedRaw[0] ?? null : (schedRaw?.results?.[0] ?? schedRaw),
    v1_status: v1Res.status,
    v1_type: Array.isArray(v1Raw) ? 'array' : (v1Raw ? typeof v1Raw : 'null'),
    v1_length: Array.isArray(v1Raw) ? v1Raw.length : (v1Raw?.results?.length ?? null),
    v1_first: Array.isArray(v1Raw) ? v1Raw[0] ?? null : (v1Raw?.results?.[0] ?? v1Raw),
  })
}
