import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

async function geocodeAdres(postcode?: string | null, straat?: string | null, stad?: string | null): Promise<{ lat: number; lng: number } | null> {
  const parts: string[] = []
  if (straat?.trim()) parts.push(straat.trim())
  if (postcode?.trim()) parts.push(postcode.replace(/\s/g, ''))
  if (stad?.trim()) parts.push(stad.trim())
  if (parts.length === 0) return null

  const q = parts.join(', ') + ', Netherlands'
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

/** Geocode winkels die postcode/straat+stad hebben maar geen lat/lng. Alleen admin. */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth

  const { data: winkels } = await supabase
    .from('winkels')
    .select('id, naam, postcode, straat, stad, lat, lng')
    .or('lat.is.null,lng.is.null')

  const zonderCoords = (winkels ?? []).filter(
    (w: { postcode?: string; straat?: string; stad?: string }) =>
      (w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
  )

  let bijgewerkt = 0
  for (const w of zonderCoords) {
    const coords = await geocodeAdres(w.postcode, w.straat, w.stad)
    if (coords) {
      await supabase
        .from('winkels')
        .update({ lat: coords.lat, lng: coords.lng })
        .eq('id', w.id)
      bijgewerkt++
      await new Promise(r => setTimeout(r, 1100))
    }
  }

  return NextResponse.json({ bijgewerkt, totaal: zonderCoords.length })
}
