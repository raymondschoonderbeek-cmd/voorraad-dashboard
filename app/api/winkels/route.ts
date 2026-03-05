import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('winkels')
    .select('*')
    .order('naam')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
  const { naam, dealer_nummer, postcode, straat, huisnummer, stad, land, api_type } = body

  if (!naam || !dealer_nummer) {
    return NextResponse.json({ error: 'Naam en dealer nummer zijn verplicht' }, { status: 400 })
  }

  const landVal = land === 'Belgium' || land === 'Netherlands' ? land : null
  const straatVoorCoords = straat && huisnummer ? `${straat} ${huisnummer}` : straat
  const { lat, lng } = (postcode || straatVoorCoords) ? await haalCoordsOp(postcode, straatVoorCoords, stad, landVal) : { lat: null, lng: null }

  const { data, error } = await supabase
    .from('winkels')
    .insert([{
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
    }])
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
  const { id, naam, dealer_nummer, postcode, straat, huisnummer, stad, land, wilmar_organisation_id, wilmar_branch_id, wilmar_store_naam, api_type } = body

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
