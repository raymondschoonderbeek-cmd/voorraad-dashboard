import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const JOAN_BASE = 'https://portal.getjoan.com/api/v1.0'

async function tryToken(url: string, method: string, headers: Record<string, string>, body?: string) {
  try {
    const res = await fetch(url, { method, headers, body })
    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = text }
    return { url, method, status: res.status, json }
  } catch (e) {
    return { url, method, error: String(e) }
  }
}

export async function GET() {
  const { user } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const clientId = process.env.JOAN_CLIENT_ID
  const clientSecret = process.env.JOAN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'JOAN_CLIENT_ID of JOAN_CLIENT_SECRET niet ingesteld' })
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  // Probeer meerdere token-varianten parallel
  const results = await Promise.all([
    tryToken(`${JOAN_BASE}/auth/token/`, 'GET', { Authorization: `Basic ${credentials}` }),
    tryToken(`${JOAN_BASE}/oauth/token/`, 'POST', {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, 'grant_type=client_credentials'),
    tryToken(`${JOAN_BASE}/token/`, 'POST', {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, 'grant_type=client_credentials'),
    tryToken(`${JOAN_BASE}/auth/token/`, 'POST', {
      'Content-Type': 'application/json',
    }, JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })),
  ])

  // Zoek welke variant een access_token teruggaf
  const werkend = results.find(r => (r as { json?: { access_token?: string } }).json?.access_token)

  if (!werkend) {
    return NextResponse.json({ bericht: 'Geen van de token-varianten werkte', resultaten: results })
  }

  const token = (werkend as { json: { access_token: string } }).json.access_token

  // Rooms ophalen
  const roomsRes = await fetch(`${JOAN_BASE}/rooms/`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const roomsRaw = await roomsRes.json()

  // Events ophalen
  const now = new Date()
  const over2u = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const eventsRes = await fetch(
    `${JOAN_BASE}/events/?start=${now.toISOString()}&end=${over2u.toISOString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const eventsRaw = await eventsRes.json()

  return NextResponse.json({
    tokenVariant: { url: werkend.url, method: werkend.method },
    rooms: roomsRaw,
    events: eventsRaw,
  })
}
