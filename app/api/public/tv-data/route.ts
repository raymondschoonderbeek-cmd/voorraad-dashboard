import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// WMO-weercode → leesbare omschrijving + icoon
function weerInfo(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Helder', icon: '☀️' }
  if (code <= 2) return { label: 'Gedeeltelijk bewolkt', icon: '⛅' }
  if (code === 3) return { label: 'Bewolkt', icon: '☁️' }
  if (code <= 48) return { label: 'Mist', icon: '🌫️' }
  if (code <= 55) return { label: 'Motregen', icon: '🌦️' }
  if (code <= 65) return { label: 'Regen', icon: '🌧️' }
  if (code <= 77) return { label: 'Sneeuw', icon: '❄️' }
  if (code <= 82) return { label: 'Buien', icon: '🌦️' }
  if (code <= 99) return { label: 'Onweer', icon: '⛈️' }
  return { label: 'Onbekend', icon: '🌡️' }
}

function isJarigBinnen(geboortedatum: string, dagenVooruit: number): boolean {
  const verjaardag = new Date(geboortedatum)
  const vandaag = new Date()
  for (let i = 0; i <= dagenVooruit; i++) {
    const dag = new Date(vandaag)
    dag.setDate(vandaag.getDate() + i)
    if (
      verjaardag.getMonth() === dag.getMonth() &&
      verjaardag.getDate() === dag.getDate()
    ) return true
  }
  return false
}

function dagenTotVerjaardag(geboortedatum: string): number {
  const verjaardag = new Date(geboortedatum)
  const vandaag = new Date()
  let volgende = new Date(vandaag.getFullYear(), verjaardag.getMonth(), verjaardag.getDate())
  if (volgende < vandaag) volgende.setFullYear(vandaag.getFullYear() + 1)
  return Math.floor((volgende.getTime() - vandaag.setHours(0, 0, 0, 0)) / 86400000)
}

export async function GET() {
  const supabase = createAdminClient()

  // Nieuws (laatste 10 gepubliceerde berichten)
  const { data: newsData } = await supabase
    .from('drg_news_posts')
    .select('id, title, excerpt, body_html, category, is_important, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .eq('toon_op_tv', true)
    .order('published_at', { ascending: false })
    .limit(10)

  // TV mededelingen (actief, gesorteerd)
  const { data: mededelingenData } = await supabase
    .from('tv_mededelingen')
    .select('id, tekst, sort_order')
    .eq('actief', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Verjaardagen: alle profielen met geboortedatum
  const { data: profielenData } = await supabase
    .from('profiles')
    .select('user_id, geboortedatum, weergave_naam')
    .not('geboortedatum', 'is', null)

  // Emails ophalen voor weergave_naam fallback
  const userIds = (profielenData ?? []).map(p => p.user_id)
  let emailMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    for (const u of usersData?.users ?? []) {
      emailMap[u.id] = u.email ?? ''
    }
  }

  // Jarigen vandaag en komende 14 dagen
  const jarigen = (profielenData ?? [])
    .filter(p => isJarigBinnen(p.geboortedatum!, 14))
    .map(p => {
      const email = emailMap[p.user_id] ?? ''
      const naam = p.weergave_naam ?? email.split('@')[0]
      const verjaardag = new Date(p.geboortedatum!)
      const dagen = dagenTotVerjaardag(p.geboortedatum!)
      return {
        naam,
        dag: verjaardag.getDate(),
        maand: verjaardag.getMonth() + 1,
        dagenTot: dagen,
        vandaag: dagen === 0,
      }
    })
    .sort((a, b) => a.dagenTot - b.dagenTot)

  // Weer via Open-Meteo (Amsterdam als standaard — geen API-sleutel nodig)
  let weer: { temp: number; label: string; icon: string } | null = null
  try {
    const weerRes = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=4.90&current=temperature_2m,weathercode&timezone=Europe/Amsterdam',
      { next: { revalidate: 600 } }
    )
    if (weerRes.ok) {
      const weerJson = await weerRes.json() as {
        current: { temperature_2m: number; weathercode: number }
      }
      const { temperature_2m, weathercode } = weerJson.current
      weer = { temp: Math.round(temperature_2m), ...weerInfo(weathercode) }
    }
  } catch { /* weer niet beschikbaar */ }

  return NextResponse.json({
    nieuws: newsData ?? [],
    mededelingen: mededelingenData ?? [],
    jarigen,
    weer,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
