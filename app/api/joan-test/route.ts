import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

async function probe(url: string, method: string, headers: Record<string, string>, body?: string) {
  try {
    const res = await fetch(url, { method, headers, body })
    const text = await res.text()
    let json: unknown
    try { json = JSON.parse(text) } catch { json = text }
    return { url, method, status: res.status, json }
  } catch (e) {
    return { url, method, status: 0, json: String(e) }
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

  const b64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const bases = [
    'https://portal.getjoan.com/api/v1.0',
    'https://portal.getjoan.com/api/v2.0',
    'https://portal.getjoan.com/api',
  ]
  const tokenPaths = ['/oauth/token/', '/auth/token/', '/token/']

  // Probeer GET op /oauth/token/ (soms accepteert het GET ipv POST)
  // Probeer directe Bearer met de secret (sommige APIs, geen token exchange)
  // Probeer alle base + path combis

  const tests = await Promise.all([
    // GET varianten
    ...bases.flatMap(base => tokenPaths.map(path =>
      probe(`${base}${path}`, 'GET', { Authorization: `Basic ${b64}` })
    )),
    // Direct Bearer met client_secret als token
    probe('https://portal.getjoan.com/api/v1.0/rooms/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    probe('https://portal.getjoan.com/api/v2.0/rooms/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    // Token auth
    probe('https://portal.getjoan.com/api/v1.0/rooms/', 'GET', { Authorization: `Token ${clientSecret}` }),
    probe('https://portal.getjoan.com/api/v2.0/rooms/', 'GET', { Authorization: `Token ${clientSecret}` }),
    // Me endpoint om base URL te vinden
    probe('https://portal.getjoan.com/api/v1.0/me/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    probe('https://portal.getjoan.com/api/v2.0/me/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
  ])

  // Filter interessante responses (niet 404 op onbekende paden)
  const interessant = tests.filter(t => t.status !== 404 || String(t.json).includes('token') || String(t.json).includes('room'))

  return NextResponse.json({ interessant, alle: tests })
}
