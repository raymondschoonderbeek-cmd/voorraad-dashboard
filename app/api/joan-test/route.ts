import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const { user } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'JOAN_CLIENT_ID of JOAN_CLIENT_SECRET niet ingesteld' })
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  // Token ophalen
  const tokenRes = await fetch('https://portal.getjoan.com/api/token/', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const tokenJson = await tokenRes.json() as { access_token?: string; expires_in?: number }

  if (!tokenJson.access_token) {
    return NextResponse.json({ stap: 'token_mislukt', status: tokenRes.status, tokenJson })
  }

  const token = tokenJson.access_token

  // Rooms + events parallel ophalen
  const now = new Date()
  const over2u = new Date(now.getTime() + 2 * 60 * 60 * 1000)

  const [roomsRes, eventsRes] = await Promise.all([
    fetch('https://portal.getjoan.com/api/2.0/rooms/', {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://portal.getjoan.com/api/2.0/events/?start=${now.toISOString()}&end=${over2u.toISOString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ])

  const rooms = await roomsRes.json()
  const events = eventsRes.ok ? await eventsRes.json() : { status: eventsRes.status, error: await eventsRes.text() }

  return NextResponse.json({
    tokenOk: true,
    roomsStatus: roomsRes.status,
    rooms,
    eventsStatus: eventsRes.status,
    events,
  })
}
