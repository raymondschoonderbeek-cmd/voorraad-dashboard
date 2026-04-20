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

  const tests = await Promise.all([
    // v2 token endpoints
    probe('https://portal.getjoan.com/api/v2/oauth/token/', 'POST', {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, 'grant_type=client_credentials'),
    probe('https://portal.getjoan.com/api/v2/auth/token/', 'POST', {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, 'grant_type=client_credentials'),
    probe('https://portal.getjoan.com/api/v2/token/', 'POST', {
      Authorization: `Basic ${b64}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }, 'grant_type=client_credentials'),
    // v2 direct bearer
    probe('https://portal.getjoan.com/api/v2/rooms/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    probe('https://portal.getjoan.com/api/v2/me/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    probe('https://portal.getjoan.com/api/v2/rooms/', 'GET', { Authorization: `Token ${clientSecret}` }),
    // OpenAPI spec ophalen met credentials
    probe('https://portal.getjoan.com/api/docs/v2/openapi.json', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    probe('https://portal.getjoan.com/api/v2/schema/', 'GET', { Authorization: `Bearer ${clientSecret}` }),
    // v1 direct bearer (nog een keer met juiste secret)
    probe('https://portal.getjoan.com/api/v1.0/rooms/', 'GET', { Authorization: `Bearer ${clientId}` }),
    probe('https://portal.getjoan.com/api/v1.0/me/', 'GET', { Authorization: `Token ${clientId}` }),
  ])

  const interessant = tests.filter(t => t.status !== 404)

  return NextResponse.json({ interessant, alle: tests })
}
