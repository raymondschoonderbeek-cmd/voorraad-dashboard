import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { getCachedVenditStats, setCachedVenditStats } from '@/lib/vendit-cache'

function normalizeDealer(v: unknown): string {
  const s = String(v ?? '').trim()
  if (!s) return s
  return s.replace(/^0+/, '') || '0'
}

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: winkelsRaw, error } = await supabase
    .from('winkels')
    .select('*')
    .order('naam')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const venditWinkels = (winkelsRaw ?? []).filter((w: { api_type?: string }) => w.api_type === 'vendit')
  const venditLaatstPerDealer = new Map<string, string>()
  if (venditWinkels.length > 0) {
    const cached = getCachedVenditStats()
    if (cached) {
      for (const [k, dt] of Object.entries(cached)) {
        if (dt) {
          venditLaatstPerDealer.set(k.trim(), dt)
          venditLaatstPerDealer.set(normalizeDealer(k), dt)
        }
      }
    } else {
      try {
        let statsObj = await supabase.rpc('get_vendit_dealer_stats_json').then(r => r.data)
        if (Array.isArray(statsObj) && statsObj.length > 0 && typeof statsObj[0] === 'object') {
          const first = statsObj[0] as Record<string, unknown>
          statsObj = first.get_vendit_dealer_stats_json ?? Object.values(first)[0] ?? statsObj
        }
        if (statsObj && typeof statsObj === 'object' && !Array.isArray(statsObj)) {
          const toCache: Record<string, string> = {}
          for (const [k, dt] of Object.entries(statsObj)) {
            if (dt) {
              const kNorm = normalizeDealer(k)
              const dtStr = typeof dt === 'string' ? dt : new Date(dt as Date).toISOString()
              venditLaatstPerDealer.set(k.trim(), dtStr)
              venditLaatstPerDealer.set(kNorm, dtStr)
              toCache[k.trim()] = dtStr
            }
          }
          setCachedVenditStats(toCache)
        }
      } catch {
        const { data: stats } = await supabase.rpc('get_vendit_dealer_stats')
        for (const row of stats ?? []) {
          const d = (row as { dealer_nummer: string })?.dealer_nummer
          const dt = (row as { last_updated: string })?.last_updated
          if (d != null && dt) {
            const k = String(d).trim()
            venditLaatstPerDealer.set(k, dt)
            venditLaatstPerDealer.set(normalizeDealer(d), dt)
          }
        }
      }
    }
  }

  const winkels = (winkelsRaw ?? []).map((w: any) => {
    const { vendit_api_password: _p, ...rest } = w
    const base = rest as any
    if (base.api_type === 'vendit') {
      const key = String(base.dealer_nummer ?? '').trim()
      const keyNorm = normalizeDealer(base.dealer_nummer)
      const laatstDatum = venditLaatstPerDealer.get(key) ?? venditLaatstPerDealer.get(keyNorm) ?? null
      return { ...base, vendit_laatst_datum: laatstDatum }
    }
    return base
  })

  return NextResponse.json(winkels, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

function bepaalLand(postcode?: string | null, stad?: string | null): 'Belgium' | 'Netherlands' {
  const pc = (postcode ?? '').replace(/\s/g, '')
  if (/^\d{4}$/.test(pc)) return 'Belgium'
  const stadLower = (stad ?? '').toLowerCase()
  if (['brussel', 'brussels', 'antwerpen', 'antwerp', 'gent', 'ghent', 'liège', 'liege', 'luik', 'charleroi', 'brugge', 'bruges', 'namur', 'namen', 'leuven', 'mons', 'bergen', 'aalst', 'mechelen', 'kortrijk', 'hasselt', 'sint-niklaas', 'genk', 'roeselare', 'dendermonde', 'turnhout', 'dilbeek', 'heist-op-den-berg', 'lokeren', 'vilvoorde', 'sint-truiden', 'mouscron', 'la louvière', 'louvière', 'waregem', 'geel', 'braine-l\'alleud', 'louvain-la-neuve', 'oostende', 'ostend', 'nieuwpoort', 'knokke', 'heist', 'wavre', 'nivelles', 'waterloo', 'seraing', 'verviers'].some(s => stadLower.includes(s))) return 'Belgium'
  return 'Netherlands'
}

async function haalCoordsOp(postcode?: string | null, straat?: string | null, stad?: string | null, land?: 'Netherlands' | 'Belgium' | null) {
  const parts: string[] = []
  if (straat?.trim()) parts.push(straat.trim())
  if (postcode?.trim()) parts.push(postcode.replace(/\s/g, ''))
  if (stad?.trim()) parts.push(stad.trim())
  if (parts.length === 0) return { lat: null, lng: null }
  const landStr = land ?? bepaalLand(postcode, stad)
  const q = parts.join(', ') + `, ${landStr}`
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'DynamoRetailDashboard/1.0' } }
    )
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
  } catch (e) {
    console.error('Geocoding mislukt:', e)
  }
  return { lat: null, lng: null }
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json()
  const { naam, dealer_nummer, postcode, straat, huisnummer, stad, land, api_type, vendit_api_key, vendit_api_username, vendit_api_password } = body

  if (!naam || !dealer_nummer) {
    return NextResponse.json({ error: 'Naam en dealer nummer zijn verplicht' }, { status: 400 })
  }

  const landVal = land === 'Belgium' || land === 'Netherlands' ? land : null
  const straatVoorCoords = straat && huisnummer ? `${straat} ${huisnummer}` : straat
  const { lat, lng } = (postcode || straatVoorCoords) ? await haalCoordsOp(postcode, straatVoorCoords, stad, landVal) : { lat: null, lng: null }

  const insertData: Record<string, unknown> = {
    naam,
    dealer_nummer,
    postcode: postcode ?? null,
    straat: straat ?? null,
    huisnummer: huisnummer ?? null,
    stad: stad ?? null,
    land: landVal,
    lat,
    lng,
    api_type: api_type ?? 'cyclesoftware',
  }
  if (api_type === 'vendit_api') {
    insertData.vendit_api_key = (vendit_api_key ?? '').trim() || null
    insertData.vendit_api_username = (vendit_api_username ?? '').trim() || null
    if ((vendit_api_password ?? '').trim()) insertData.vendit_api_password = (vendit_api_password ?? '').trim()
  }

  const { data, error } = await supabase
    .from('winkels')
    .insert([insertData])
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data[0])
}

export async function PUT(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json()
  const { id, naam, dealer_nummer, postcode, straat, huisnummer, stad, land, wilmar_organisation_id, wilmar_branch_id, wilmar_store_naam, api_type, vendit_api_key, vendit_api_username, vendit_api_password } = body

  if (!id) return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })

  const landVal = land === 'Belgium' || land === 'Netherlands' ? land : null
  const straatVoorCoords = straat && huisnummer ? `${straat} ${huisnummer}` : straat
  const { lat, lng } = (postcode || straatVoorCoords) ? await haalCoordsOp(postcode, straatVoorCoords, stad, landVal) : { lat: null, lng: null }

  const updateData: any = {
    naam,
    dealer_nummer,
    postcode: postcode || null,
    straat: straat ?? null,
    huisnummer: huisnummer ?? null,
    stad: stad || null,
    land: landVal,
    lat,
    lng,
    wilmar_organisation_id: wilmar_organisation_id ?? null,
    wilmar_branch_id: wilmar_branch_id ?? null,
    wilmar_store_naam: wilmar_store_naam ?? null,
    cycle_api_authorized: null,
    cycle_api_checked_at: null,
  }

  if (api_type) {
    updateData.api_type = api_type
  }
  if (vendit_api_key !== undefined) updateData.vendit_api_key = vendit_api_key === '' ? null : vendit_api_key
  if (vendit_api_username !== undefined) updateData.vendit_api_username = vendit_api_username === '' ? null : vendit_api_username
  if (vendit_api_password !== undefined && vendit_api_password !== '') updateData.vendit_api_password = vendit_api_password

  const { error } = await supabase
    .from('winkels')
    .update(updateData)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
export async function DELETE(req: NextRequest) {
  const rl = withRateLimit(req)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  const { error } = await supabase
    .from('winkels')
    .delete()
    .eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
