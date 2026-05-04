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
  const q = parts.join(', ') + `, ${landStr}`
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'DRGPortal/1.0' } }
    )
    if (!res.ok) return { coords: null, reden: `Nominatim HTTP ${res.status}` }
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { coords: { lat, lng }, reden: null }
    }
    return { coords: null, reden: `Adres niet gevonden: "${q}"` }
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
 * GET — streaming geocoding met SSE voortgang (beheer pagina).
 * Optioneel: ?force_belgium=1
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth

  const { searchParams } = new URL(request.url)
  const forceBelgium = searchParams.get('force_belgium') === '1'

  const encoder = new TextEncoder()
  function sse(data: object) {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
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

        const totaal = teVerwerken.length + zonderAdres.length
        controller.enqueue(sse({ type: 'start', totaal, metAdres: teVerwerken.length, zonderAdres: zonderAdres.length }))

        // Direct rapporteren: winkels zonder adres
        for (const w of zonderAdres) {
          controller.enqueue(sse({ type: 'voortgang', naam: w.naam ?? `#${w.id}`, status: 'overgeslagen', reden: 'Geen adres ingevuld' }))
        }

        let bijgewerkt = 0
        let mislukt = 0

        for (let i = 0; i < teVerwerken.length; i++) {
          const w = teVerwerken[i]
          controller.enqueue(sse({ type: 'bezig', naam: w.naam ?? `#${w.id}`, index: i + 1, totaal: teVerwerken.length }))

          let landVal: 'Belgium' | 'Netherlands' | null = w.land === 'Belgium' || w.land === 'Netherlands' ? w.land : null
          if (!landVal && forceBelgium && isBelgischeWinkel(w)) landVal = 'Belgium'

          const result = await geocodeMetReden(w.postcode, w.straat, w.stad, landVal, w.huisnummer)

          if (result.coords) {
            await supabase.from('winkels').update({ lat: result.coords.lat, lng: result.coords.lng }).eq('id', w.id)
            bijgewerkt++
            controller.enqueue(sse({ type: 'voortgang', naam: w.naam ?? `#${w.id}`, status: 'ok', index: i + 1 }))
          } else {
            mislukt++
            controller.enqueue(sse({ type: 'voortgang', naam: w.naam ?? `#${w.id}`, status: 'mislukt', reden: result.reden, index: i + 1 }))
          }

          if (i < teVerwerken.length - 1) {
            await new Promise(r => setTimeout(r, 1100))
          }
        }

        controller.enqueue(sse({ type: 'klaar', bijgewerkt, mislukt, zonderAdres: zonderAdres.length }))
      } catch (err) {
        controller.enqueue(sse({ type: 'fout', bericht: err instanceof Error ? err.message : 'Onbekende fout' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/** POST — batch geocoding zonder streaming (winkels-kaart pagina). */
export async function POST(request: NextRequest) {
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
