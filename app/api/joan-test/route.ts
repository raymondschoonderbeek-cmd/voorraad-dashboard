import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const JOAN_BASE = 'https://portal.getjoan.com/api/v1.0'

export async function GET() {
  const { user } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'JOAN_CLIENT_ID of JOAN_CLIENT_SECRET niet ingesteld' })
  }

  // Stap 1: token ophalen
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  let token: string | null = null
  let tokenRaw: unknown = null
  try {
    const tokenRes = await fetch(`${JOAN_BASE}/auth/token/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    tokenRaw = await tokenRes.json()
    token = (tokenRaw as { access_token?: string })?.access_token ?? null
  } catch (e) {
    return NextResponse.json({ stap: 'token', error: String(e) })
  }

  if (!token) {
    return NextResponse.json({ stap: 'token_mislukt', tokenRaw })
  }

  // Stap 2: rooms ophalen
  let roomsRaw: unknown = null
  try {
    const roomsRes = await fetch(`${JOAN_BASE}/rooms/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    roomsRaw = await roomsRes.json()
  } catch (e) {
    return NextResponse.json({ stap: 'rooms', tokenOk: true, error: String(e) })
  }

  // Stap 3: events ophalen (komende 2 uur)
  const now = new Date()
  const over2u = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  let eventsRaw: unknown = null
  try {
    const eventsRes = await fetch(
      `${JOAN_BASE}/events/?start=${now.toISOString()}&end=${over2u.toISOString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    eventsRaw = await eventsRes.json()
  } catch (e) {
    eventsRaw = { error: String(e) }
  }

  return NextResponse.json({ tokenOk: true, rooms: roomsRaw, events: eventsRaw })
}
