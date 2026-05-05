import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

function bepaalLand(postcode?: string | null, stad?: string | null): 'Belgium' | 'Netherlands' {
  const pc = (postcode ?? '').replace(/\s/g, '')
  if (/^\d{4}$/.test(pc)) return 'Belgium'
  const stadLower = (stad ?? '').toLowerCase()
  if (['brussel', 'brussels', 'antwerpen', 'antwerp', 'gent', 'ghent', 'liège', 'liege', 'luik', 'charleroi', 'brugge', 'bruges', 'namur', 'namen', 'leuven', 'mons', 'bergen', 'aalst', 'mechelen', 'kortrijk', 'hasselt', 'sint-niklaas', 'genk', 'roeselare', 'dendermonde', 'turnhout', 'dilbeek', 'heist-op-den-berg', 'lokeren', 'vilvoorde', 'sint-truiden', 'mouscron', 'la louvière', 'louvière', 'waregem', 'geel', 'braine-l\'alleud', 'louvain-la-neuve', 'oostende', 'ostend', 'nieuwpoort', 'knokke', 'heist', 'wavre', 'nivelles', 'waterloo', 'seraing', 'verviers'].some(s => stadLower.includes(s))) return 'Belgium'
  return 'Netherlands'
}

type GeoResult = { coords: { lat: number; lng: number }; reden: null } | { coords: null; reden: string }

async function geocodeMetReden(
  postcode?: string | null,
  straat?: string | null,
  stad?: string | null,
  land?: 'Netherlands' | 'Belgium' | null,
  huisnummer?: string | null,
): Promise<GeoResult> {
  const parts: string[] = []
  if (straat?.trim()) parts.push(huisnummer?.trim() ? `${straat.trim()} ${huisnummer.trim()}` : straat.trim())
  if (postcode?.trim()) parts.push(postcode.replace(/\s/g, ''))
  if (stad?.trim()) parts.push(stad.trim())
  if (parts.length === 0) return { coords: null, reden: 'Geen adres ingevuld' }

  const landStr = land ?? bepaalLand(postcode, stad)
  const countryCode = landStr === 'Belgium' ? 'be' : 'nl'
  const q = parts.join(', ')
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycode=${countryCode}&addressdetails=0`,
      { headers: { 'User-Agent': 'DRGPortal/1.0' } }
    )
    if (!res.ok) return { coords: null, reden: `Nominatim HTTP ${res.status}` }
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { coords: { lat, lng }, reden: null }
    }
    return { coords: null, reden: `Adres niet gevonden: "${q}" (${countryCode.toUpperCase()})` }
  } catch (e) {
    return { coords: null, reden: `Netwerkfout: ${e instanceof Error ? e.message : 'onbekend'}` }
  }
}

function isBelgischePostcode(postcode?: string | null): boolean {
  const pc = (postcode ?? '').replace(/\s/g, '')
  if (/^\d{4}$/.test(pc)) return true
  const digits = pc.replace(/\D/g, '')
  return digits.length === 4 && /^\d{4}$/.test(digits)
}

function isBelgischeWinkel(w: { postcode?: string | null; straat?: string | null; stad?: string | null; land?: string | null }): boolean {
  if (w.land === 'Belgium') return true
  if (isBelgischePostcode(w.postcode)) return true
  if (bepaalLand(w.postcode, w.stad) === 'Belgium') return true
  return false
}

type WinkelRij = { id: number; naam: string | null; postcode: string | null; straat: string | null; huisnummer: string | null; stad: string | null; land: string | null; lat: number | null; lng: number | null }

/**
 * GET — geeft de wachtrij van winkels zonder coördinaten terug.
 * De client verwerkt ze één voor één met eigen delay (geen timeout-risico).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const forceBelgium = searchParams.get('force_belgium') === '1'

  let teVerwerken: WinkelRij[] = []
  let zonderAdres: WinkelRij[] = []

  if (forceBelgium) {
    const { data } = await supabase.from('winkels').select('id, naam, postcode, straat, huisnummer, stad, land, lat, lng')
    const belgisch = (data ?? []).filter((w: any) => isBelgischeWinkel(w)) as WinkelRij[]
    teVerwerken = belgisch.filter(w => w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
    zonderAdres = belgisch.filter(w => !w.postcode?.trim() && !(w.straat?.trim() && w.stad?.trim()))
  } else {
    const { data } = await supabase.from('winkels').select('id, naam, postcode, straat, huisnummer, stad, land, lat, lng').or('lat.is.null,lng.is.null')
    const alle = (data ?? []) as WinkelRij[]
    teVerwerken = alle.filter(w => w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
    zonderAdres = alle.filter(w => !w.postcode?.trim() && !(w.straat?.trim() && w.stad?.trim()))
  }

  return NextResponse.json({ teVerwerken, zonderAdres })
}

/**
 * POST — geocodeert één winkel (body: {id}) of een batch (geen id, winkels-kaartpagina).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth

  const body = await request.json().catch(() => ({})) as { id?: number }

  // Eén winkel geocoderen (vanuit beheer-pagina client loop)
  if (body.id) {
    const { data: winkel } = await supabase
      .from('winkels')
      .select('id, naam, postcode, straat, huisnummer, stad, land')
      .eq('id', body.id)
      .single()
    if (!winkel) return NextResponse.json({ ok: false, reden: 'Winkel niet gevonden' })
    const w = winkel as WinkelRij
    const landVal: 'Belgium' | 'Netherlands' | null = w.land === 'Belgium' || w.land === 'Netherlands' ? w.land : null
    const result = await geocodeMetReden(w.postcode, w.straat, w.stad, landVal, w.huisnummer)
    if (result.coords) {
      await supabase.from('winkels').update({ lat: result.coords.lat, lng: result.coords.lng }).eq('id', w.id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok: false, reden: result.reden })
  }

  // Batch (winkels-kaartpagina — bestaand gedrag)
  const { searchParams } = new URL(request.url)
  const forceBelgium = searchParams.get('force_belgium') === '1'

  let teVerwerken: WinkelRij[] = []
  let zonderAdres: WinkelRij[] = []

  if (forceBelgium) {
    const { data } = await supabase.from('winkels').select('id, naam, postcode, straat, huisnummer, stad, land, lat, lng')
    const belgisch = (data ?? []).filter((w: any) => isBelgischeWinkel(w)) as WinkelRij[]
    teVerwerken = belgisch.filter(w => w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
    zonderAdres = belgisch.filter(w => !w.postcode?.trim() && !(w.straat?.trim() && w.stad?.trim()))
  } else {
    const { data } = await supabase.from('winkels').select('id, naam, postcode, straat, huisnummer, stad, land, lat, lng').or('lat.is.null,lng.is.null')
    const alle = (data ?? []) as WinkelRij[]
    teVerwerken = alle.filter(w => w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
    zonderAdres = alle.filter(w => !w.postcode?.trim() && !(w.straat?.trim() && w.stad?.trim()))
  }

  const mislukt: { id: number; naam: string }[] = []
  let bijgewerkt = 0
  for (const w of teVerwerken) {
    let landVal: 'Belgium' | 'Netherlands' | null = w.land === 'Belgium' || w.land === 'Netherlands' ? w.land : null
    if (!landVal && forceBelgium && isBelgischeWinkel(w)) landVal = 'Belgium'
    const result = await geocodeMetReden(w.postcode, w.straat, w.stad, landVal, w.huisnummer)
    if (result.coords) {
      await supabase.from('winkels').update({ lat: result.coords.lat, lng: result.coords.lng }).eq('id', w.id)
      bijgewerkt++
      await new Promise(r => setTimeout(r, 1100))
    } else {
      mislukt.push({ id: w.id, naam: w.naam ?? `#${w.id}` })
    }
  }

  return NextResponse.json({ bijgewerkt, totaal: teVerwerken.length, mislukt, zonderAdres: zonderAdres.map(w => ({ id: w.id, naam: w.naam ?? `#${w.id}` })) })
}
