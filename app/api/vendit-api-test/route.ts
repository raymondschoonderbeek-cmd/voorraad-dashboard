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
  const { winkel_id, path, params: pathParams } = body as { winkel_id?: number; path?: string; params?: Record<string, string> }

  if (!winkel_id || !path?.trim()) {
    return NextResponse.json({ error: 'winkel_id en path zijn verplicht' }, { status: 400 })
  }

  const { data: winkel, error: winkelError } = await supabase
    .from('winkels')
    .select('id, naam, vendit_api_key, vendit_api_username, vendit_api_password, api_type')
    .eq('id', winkel_id)
    .single()

  if (winkelError || !winkel) {
    return NextResponse.json({ error: 'Winkel niet gevonden' }, { status: 404 })
  }
  if (winkel.api_type !== 'vendit') {
    return NextResponse.json({ error: 'Winkel is geen Vendit-winkel' }, { status: 400 })
  }
  const key = (winkel.vendit_api_key ?? '').trim()
  const username = (winkel.vendit_api_username ?? '').trim()
  const password = (winkel.vendit_api_password ?? '').trim()
  if (!key || !username || !password) {
    return NextResponse.json({ error: 'Vendit API credentials ontbreken. Vul API Key, Username en Wachtwoord in bij Beheer > Winkels.' }, { status: 400 })
  }

  let resolvedPath = path.trim()
  if (pathParams && typeof pathParams === 'object') {
    for (const [k, v] of Object.entries(pathParams)) {
      if (v != null && String(v).trim()) {
        resolvedPath = resolvedPath.replace(`{${k}}`, encodeURIComponent(String(v).trim()))
      }
    }
  }

  try {
    const token = await getVenditToken(key, username, password)
    const url = `${VENDIT_BASE}${resolvedPath}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ApiKey: key,
        Token: token,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })
    const text = await res.text()
    let data: unknown = text
    try {
      data = JSON.parse(text)
    } catch {
      // niet JSON
    }
    return NextResponse.json({
      status: res.status,
      statusText: res.statusText,
      url,
      data,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
