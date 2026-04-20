import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { getRoomAvailability } from '@/lib/joan'
import { parseBrancheNieuwsRss, type BrancheNieuwsItem } from '@/lib/branche-nieuws-rss'

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
  const { user } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const supabase = createAdminClient()

  // Nieuws (gepubliceerd, toon_op_tv, max 7 dagen oud)
  const zeven_dagen_geleden = new Date()
  zeven_dagen_geleden.setDate(zeven_dagen_geleden.getDate() - 7)
  const { data: newsData } = await supabase
    .from('drg_news_posts')
    .select('id, title, excerpt, body_html, category, is_important, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .gte('published_at', zeven_dagen_geleden.toISOString())
    .eq('toon_op_tv', true)
    .order('published_at', { ascending: false })
    .limit(10)

  // TV mededelingen (actief + geldigheidsperiode)
  const vandaag = new Date().toISOString().slice(0, 10)
  const { data: mededelingenData } = await supabase
    .from('tv_mededelingen')
    .select('id, tekst, sort_order')
    .eq('actief', true)
    .or(`geldig_van.is.null,geldig_van.lte.${vandaag}`)
    .or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Hoogtepunten komende 31 dagen
  const over31 = new Date(); over31.setDate(over31.getDate() + 31)
  const { data: hoogtepuntenData } = await supabase
    .from('tv_hoogtepunten')
    .select('id, datum, naam, icoon')
    .eq('actief', true)
    .gte('datum', vandaag)
    .lte('datum', over31.toISOString().slice(0, 10))
    .order('datum', { ascending: true })

  // Verjaardagen: alle profielen met geboortedatum
  const { data: profielenData } = await supabase
    .from('profiles')
    .select('user_id, geboortedatum, weergave_naam')
    .not('geboortedatum', 'is', null)

  // Emails ophalen voor weergave_naam fallback
  let emailMap: Record<string, string> = {}
  const userIds = (profielenData ?? []).map(p => p.user_id)
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

  type WeerData = { stad: string; temp: number; label: string; icon: string } | null

  async function fetchWeer(stad: string, lat: number, lon: number): Promise<WeerData> {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=Europe/Amsterdam`,
        { next: { revalidate: 600 } }
      )
      if (!res.ok) return null
      const json = await res.json() as { current: { temperature_2m: number; weathercode: number } }
      const { temperature_2m, weathercode } = json.current
      return { stad, temp: Math.round(temperature_2m), ...weerInfo(weathercode) }
    } catch { return null }
  }

  async function fetchRss(url: string, limit: number): Promise<BrancheNieuwsItem[]> {
    try {
      const res = await fetch(url, {
        next: { revalidate: 600 },
        headers: { 'User-Agent': 'DynamoTV/1.0' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      return parseBrancheNieuwsRss(await res.text(), limit)
    } catch { return [] }
  }

  const [weerAmersfoort, weerTurnhout, { ruimtes }, brancheNieuws, nuNieuws] = await Promise.all([
    fetchWeer('Amersfoort', 52.155, 5.388),
    fetchWeer('Turnhout', 51.323, 4.953),
    getRoomAvailability(),
    fetchRss(process.env.NIEUWSFIETS_RSS_URL ?? 'https://nieuwsfiets.nu/category/nieuws/feed/', 6),
    fetchRss('https://www.nu.nl/rss/Algemeen', 8),
  ])

  return NextResponse.json({
    nieuws: newsData ?? [],
    mededelingen: mededelingenData ?? [],
    jarigen,
    hoogtepunten: hoogtepuntenData ?? [],
    weer: [weerAmersfoort, weerTurnhout].filter(Boolean),
    ruimtes,
    brancheNieuws,
    nuNieuws,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
