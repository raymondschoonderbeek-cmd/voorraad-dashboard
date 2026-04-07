import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { getCachedVenditStats, setCachedVenditStats } from '@/lib/vendit-cache'

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
        if (dt) venditLaatstPerDealer.set(String(k).trim(), dt)
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
              const key = String(k).trim()
              const dtStr = typeof dt === 'string' ? dt : new Date(dt as Date).toISOString()
              venditLaatstPerDealer.set(key, dtStr)
              toCache[key] = dtStr
            }
          }
          setCachedVenditStats(toCache)
        }
      } catch {
        const { data: stats } = await supabase.rpc('get_vendit_dealer_stats')
        for (const row of stats ?? []) {
          const d = (row as { dealer_nummer: string })?.dealer_nummer
          const dt = (row as { last_updated: string })?.last_updated
          if (d != null && dt) venditLaatstPerDealer.set(String(d).trim(), dt)
        }
      }
    }
  }

  const winkels = (winkelsRaw ?? []).map((w: any) => {
    const { vendit_api_password: _p, ...rest } = w
    const base = rest as any
    if (base.api_type === 'vendit') {
      const key = String(base.dealer_nummer ?? '').trim()
      const laatstDatum = venditLaatstPerDealer.get(key) ?? null
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
      { headers: { 'User-Agent': 'DRGPortal/1.0' } }
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

const GELDIGE_API_TYPES = ['cyclesoftware', 'wilmar', 'vendit', 'vendit_api'] as const

function valideerWinkelVelden(body: Record<string, unknown>): string | null {
  const { naam, dealer_nummer, postcode, straat, huisnummer, stad, api_type } = body
  if (!naam || typeof naam !== 'string' || naam.trim().length === 0) return 'Naam is verplicht'
  if (naam.length > 100) return 'Naam mag maximaal 100 tekens bevatten'
  if (!dealer_nummer || typeof dealer_nummer !== 'string' || dealer_nummer.trim().length === 0) return 'Dealer nummer is verplicht'
  if (dealer_nummer.length > 50) return 'Dealer nummer mag maximaal 50 tekens bevatten'
  if (postcode !== undefined && postcode !== null && typeof postcode === 'string' && postcode.length > 20) return 'Postcode mag maximaal 20 tekens bevatten'
  if (straat !== undefined && straat !== null && typeof straat === 'string' && straat.length > 200) return 'Straat mag maximaal 200 tekens bevatten'
  if (huisnummer !== undefined && huisnummer !== null && typeof huisnummer === 'string' && huisnummer.length > 20) return 'Huisnummer mag maximaal 20 tekens bevatten'
  if (stad !== undefined && stad !== null && typeof stad === 'string' && stad.length > 100) return 'Stad mag maximaal 100 tekens bevatten'
  if (api_type !== undefined && api_type !== null && !GELDIGE_API_TYPES.includes(api_type as typeof GELDIGE_API_TYPES[number])) return `api_type moet één van de volgende waarden zijn: ${GELDIGE_API_TYPES.join(', ')}`
  return null
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang (admin vereist)' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Ongeldige request body' }, { status: 400 })
  }
  const raw = body as Record<string, unknown>
  const naam = raw.naam as string | undefined
  const dealer_nummer = raw.dealer_nummer as string | undefined
  const postcode = raw.postcode as string | null | undefined
  const straat = raw.straat as string | null | undefined
  const huisnummer = raw.huisnummer as string | null | undefined
  const stad = raw.stad as string | null | undefined
  const land = raw.land as string | null | undefined
  const api_type = raw.api_type as string | null | undefined
  const vendit_api_key = typeof raw.vendit_api_key === 'string' ? raw.vendit_api_key : ''
  const vendit_api_username = typeof raw.vendit_api_username === 'string' ? raw.vendit_api_username : ''
  const vendit_api_password = typeof raw.vendit_api_password === 'string' ? raw.vendit_api_password : ''

  const validatieFout = valideerWinkelVelden(raw)
  if (validatieFout) {
    return NextResponse.json({ error: validatieFout }, { status: 400 })
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
    insertData.vendit_api_key = vendit_api_key.trim() || null
    insertData.vendit_api_username = vendit_api_username.trim() || null
    if (vendit_api_password.trim()) insertData.vendit_api_password = vendit_api_password.trim()
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

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Ongeldige request body' }, { status: 400 })
  }
  const rawPut = body as Record<string, unknown>
  const id = rawPut.id
  const naam = rawPut.naam as string | undefined
  const dealer_nummer = rawPut.dealer_nummer as string | undefined
  const postcode = rawPut.postcode as string | null | undefined
  const straat = rawPut.straat as string | null | undefined
  const huisnummer = rawPut.huisnummer as string | null | undefined
  const stad = rawPut.stad as string | null | undefined
  const land = rawPut.land as string | null | undefined
  const wilmar_organisation_id = rawPut.wilmar_organisation_id
  const wilmar_branch_id = rawPut.wilmar_branch_id
  const wilmar_store_naam = rawPut.wilmar_store_naam
  const api_type = rawPut.api_type as string | null | undefined
  const vendit_api_key = rawPut.vendit_api_key
  const vendit_api_username = rawPut.vendit_api_username
  const vendit_api_password = rawPut.vendit_api_password

  if (!id) return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })

  const validatieFout = valideerWinkelVelden(rawPut)
  if (validatieFout) {
    return NextResponse.json({ error: validatieFout }, { status: 400 })
  }

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
