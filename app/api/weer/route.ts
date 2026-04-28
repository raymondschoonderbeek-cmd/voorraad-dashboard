import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/weer?plaatsen=Amersfoort,Turnhout
 * Proxy naar Open-Meteo (gratis, geen API-key).
 * Publiek endpoint — geen auth vereist (TV-weergave).
 */

interface WeerResultaat {
  naam: string
  temp: number
  code: number
}

type OpenMeteoResponse = {
  current: {
    temperature_2m: number
    weathercode: number
  }
}

const PLAATSEN: Record<string, { lat: number; lon: number }> = {
  amersfoort: { lat: 52.155, lon: 5.387 },
  turnhout: { lat: 51.322, lon: 4.944 },
}

async function haalWeerOp(naam: string): Promise<WeerResultaat | null> {
  const sleutel = naam.toLowerCase().trim()
  const coords = PLAATSEN[sleutel]
  if (!coords) return null

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${coords.lat}&longitude=${coords.lon}` +
      `&current=temperature_2m,weathercode&timezone=Europe/Amsterdam`

    const res = await fetch(url, { next: { revalidate: 600 } })
    if (!res.ok) return null

    const json = (await res.json()) as OpenMeteoResponse
    const { temperature_2m, weathercode } = json.current
    return {
      naam: naam.charAt(0).toUpperCase() + naam.slice(1),
      temp: Math.round(temperature_2m),
      code: weathercode,
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const plaatsenParam = searchParams.get('plaatsen') ?? 'Amersfoort,Turnhout'
  const gevraagd = plaatsenParam.split(',').map(p => p.trim()).filter(Boolean).slice(0, 5)

  const resultaten = await Promise.all(gevraagd.map(haalWeerOp))
  const gefilterd = resultaten.filter((r): r is WeerResultaat => r !== null)

  return NextResponse.json(gefilterd, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300' },
  })
}
