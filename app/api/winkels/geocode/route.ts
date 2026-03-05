import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

function bepaalLand(postcode?: string | null, stad?: string | null): 'Belgium' | 'Netherlands' {
  const pc = (postcode ?? '').replace(/\s/g, '')
  if (/^\d{4}$/.test(pc)) return 'Belgium'
  const stadLower = (stad ?? '').toLowerCase()
  if (['brussel', 'brussels', 'antwerpen', 'antwerp', 'gent', 'ghent', 'liège', 'liege', 'luik', 'charleroi', 'brugge', 'bruges', 'namur', 'namen', 'leuven', 'mons', 'bergen', 'aalst', 'mechelen', 'kortrijk', 'hasselt', 'sint-niklaas', 'genk', 'roeselare', 'dendermonde', 'turnhout', 'dilbeek', 'heist-op-den-berg', 'lokeren', 'vilvoorde', 'sint-truiden', 'mouscron', 'la louvière', 'louvière', 'waregem', 'geel', 'braine-l\'alleud', 'louvain-la-neuve', 'oostende', 'ostend', 'nieuwpoort', 'knokke', 'heist', 'wavre', 'nivelles', 'waterloo', 'seraing', 'verviers'].some(s => stadLower.includes(s))) return 'Belgium'
  return 'Netherlands'
}

async function geocodeAdres(postcode?: string | null, straat?: string | null, stad?: string | null, land?: 'Netherlands' | 'Belgium' | null): Promise<{ lat: number; lng: number } | null> {
  const parts: string[] = []
  if (straat?.trim()) parts.push(straat.trim())
  if (postcode?.trim()) parts.push(postcode.replace(/\s/g, ''))
  if (stad?.trim()) parts.push(stad.trim())
  if (parts.length === 0) return null

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
  return null
}

function isBelgischePostcode(postcode?: string | null): boolean {
  const pc = (postcode ?? '').replace(/\s/g, '')
  if (/^\d{4}$/.test(pc)) return true
  // B-1000, 1000 Brussel, etc.
  const digits = pc.replace(/\D/g, '')
  return digits.length === 4 && /^\d{4}$/.test(digits)
}

function isBelgischeWinkel(w: { postcode?: string; straat?: string; stad?: string; land?: string }): boolean {
  if (w.land === 'Belgium') return true
  if (isBelgischePostcode(w.postcode)) return true
  if (bepaalLand(w.postcode, w.stad) === 'Belgium') return true
  return false
}

/** Geocode winkels die postcode/straat+stad hebben maar geen lat/lng. Alleen admin. Optioneel: force_belgium=1 om Belgische winkels opnieuw te geocoderen. */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const forceBelgium = searchParams.get('force_belgium') === '1'

  let teVerwerken: { id: number; postcode?: string; straat?: string; stad?: string; land?: string }[] = []

  if (forceBelgium) {
    const { data: alleWinkels } = await supabase
      .from('winkels')
      .select('id, naam, postcode, straat, stad, land, lat, lng')
    teVerwerken = (alleWinkels ?? []).filter(
      (w: any) =>
        isBelgischeWinkel(w) &&
        (w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
    )
  } else {
    const { data: winkels } = await supabase
      .from('winkels')
      .select('id, naam, postcode, straat, stad, land, lat, lng')
      .or('lat.is.null,lng.is.null')
    teVerwerken = (winkels ?? []).filter(
      (w: { postcode?: string; straat?: string; stad?: string }) =>
        (w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
    )
  }

  let bijgewerkt = 0
  for (const w of teVerwerken) {
    let landVal: 'Belgium' | 'Netherlands' | null = (w as any).land === 'Belgium' || (w as any).land === 'Netherlands' ? (w as any).land : null
    if (!landVal && forceBelgium && isBelgischeWinkel(w)) landVal = 'Belgium'
    const coords = await geocodeAdres(w.postcode, w.straat, w.stad, landVal)
    if (coords) {
      await supabase
        .from('winkels')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', w.id)
      bijgewerkt++
      await new Promise(r => setTimeout(r, 1100))
    }
  }

  return NextResponse.json({ bijgewerkt, totaal: teVerwerken.length })
}
