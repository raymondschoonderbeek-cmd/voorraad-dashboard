import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

const VENDIT_OAUTH = 'https://oauth.vendit.online/Api/GetToken'
const VENDIT_BASE = 'https://api2.vendit.online'

async function getVenditToken(apiKey: string, username: string, password: string): Promise<string> {
  const params = new URLSearchParams({ apiKey, username, password })
  const res = await fetch(`${VENDIT_OAUTH}?${params}`, { method: 'POST', cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token ophalen mislukt: ${res.status} ${text}`)
  }
  const data = await res.json()
  const token = data?.access_token ?? data?.token ?? data?.accessToken
  if (!token) throw new Error('Geen token in response')
  return token
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json().catch(() => ({}))
  const { api_key, username, password, winkel_id } = body as {
    api_key?: string
    username?: string
    password?: string
    winkel_id?: number
  }

  let key: string
  let user: string
  let pass: string

  if (winkel_id && !api_key && !username && !password) {
    const { data: winkel, error } = await supabase
      .from('winkels')
      .select('vendit_api_key, vendit_api_username, vendit_api_password, api_type')
      .eq('id', winkel_id)
      .single()
    if (error || !winkel || winkel.api_type !== 'vendit_api') {
      return NextResponse.json({ error: 'Winkel niet gevonden of geen Vendit API-winkel' }, { status: 404 })
    }
    key = (winkel.vendit_api_key ?? '').trim()
    user = (winkel.vendit_api_username ?? '').trim()
    pass = (winkel.vendit_api_password ?? '').trim()
    if (!key || !user || !pass) {
      return NextResponse.json({ error: 'Credentials ontbreken in database' }, { status: 400 })
    }
  } else {
    key = (api_key ?? '').trim()
    user = (username ?? '').trim()
    pass = (password ?? '').trim()
    if (!key || !user || !pass) {
      return NextResponse.json({ error: 'Vul API Key, Username en Wachtwoord in om te testen' }, { status: 400 })
    }
  }

  try {
    const token = await getVenditToken(key, user, pass)
    const url = `${VENDIT_BASE}/VenditPublicApi/Utils/CheckApiKeyAndToken`
    const res = await fetch(url, {
      method: 'GET',
      headers: { ApiKey: key, Token: token, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `API-check mislukt: ${res.status} ${text}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true, message: 'Credentials zijn geldig' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
