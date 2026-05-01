import TvClient from './TvClient'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRoomAvailability } from '@/lib/joan'
import { parseBrancheNieuwsRss } from '@/lib/branche-nieuws-rss'
import type { NewsItem } from '@/components/tv/TvNewsCard'
import type { MededelingItem } from '@/components/tv/TvAnnouncements'
import type { WeerItem } from '@/components/tv/TvHeader'
import type { JoanRoom } from '@/lib/joan'
import type { VieringenData, VieringItem } from '@/components/tv/TvCelebrationsCard'
import type { BrancheNieuwsData } from '@/components/tv/TvTicker'

/**
 * TV-pagina (server component) — haalt data direct uit Supabase + Open-Meteo + Joan.
 * Geen auth-check nodig: middleware (cookie tv_access) dekt de route al af.
 */

const MAAND_NAMEN = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

async function haalNieuwsOp(supabase: ReturnType<typeof createAdminClient>): Promise<NewsItem[]> {
  const zevenDagenGeleden = new Date()
  zevenDagenGeleden.setDate(zevenDagenGeleden.getDate() - 7)
  const { data } = await supabase
    .from('drg_news_posts')
    .select('id, title, excerpt, body_html, category, is_important, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .gte('published_at', zevenDagenGeleden.toISOString())
    .eq('toon_op_tv', true)
    .order('published_at', { ascending: false })
    .limit(5)
  return (data ?? []) as NewsItem[]
}

async function haalMededelingenOp(supabase: ReturnType<typeof createAdminClient>): Promise<MededelingItem[]> {
  const vandaag = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('tv_mededelingen')
    .select('id, tekst, label, geldig_tot, sort_order')
    .eq('actief', true)
    .or(`geldig_van.is.null,geldig_van.lte.${vandaag}`)
    .or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as MededelingItem[]
}

async function haalWeerOp(): Promise<WeerItem[]> {
  const plaatsen: { naam: string; lat: number; lon: number }[] = [
    { naam: 'Amersfoort', lat: 52.155, lon: 5.387 },
    { naam: 'Turnhout', lat: 51.322, lon: 4.944 },
  ]

  const resultaten = await Promise.all(
    plaatsen.map(async ({ naam, lat, lon }) => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weathercode&timezone=Europe/Amsterdam`
        const res = await fetch(url, { next: { revalidate: 600 } })
        if (!res.ok) return null
        const json = (await res.json()) as {
          current: { temperature_2m: number; weathercode: number }
        }
        return {
          naam,
          temp: Math.round(json.current.temperature_2m),
          code: json.current.weathercode,
        } satisfies WeerItem
      } catch {
        return null
      }
    })
  )
  return resultaten.filter((r): r is WeerItem => r !== null)
}

async function haalRuimtesOp(): Promise<JoanRoom[]> {
  try {
    const { ruimtes } = await getRoomAvailability()
    return ruimtes
  } catch {
    return []
  }
}

async function haalVieringenOp(supabase: ReturnType<typeof createAdminClient>): Promise<VieringenData> {
  try {
    const nu = new Date()
    const vandaagStr = nu.toISOString().slice(0, 10)
    const huidigJaar = nu.getFullYear()
    const eindDatum = new Date(nu)
    eindDatum.setDate(eindDatum.getDate() + 31)
    const eindDatumStr = eindDatum.toISOString().slice(0, 10)
    const items: VieringItem[] = []

    const { data: hoogtepunten } = await supabase
      .from('tv_hoogtepunten')
      .select('datum, naam, icoon, actief')
      .eq('actief', true)
      .gte('datum', vandaagStr)
      .lte('datum', eindDatumStr)
      .order('datum', { ascending: true })

    for (const h of (hoogtepunten ?? [])) {
      const rec = h as { datum: string; naam: string; icoon: string }
      const dag = parseInt(rec.datum.slice(8, 10), 10)
      const maandIdx = parseInt(rec.datum.slice(5, 7), 10) - 1
      items.push({ type: 'hoogtepunt', naam: rec.naam, label: `${dag} ${MAAND_NAMEN[maandIdx]}`, icoon: rec.icoon || '📅', datum: rec.datum, vandaag: rec.datum === vandaagStr })
    }

    const { data: rollen } = await supabase.from('gebruiker_rollen').select('user_id, naam, afdeling')
    const rollenMap = new Map((rollen ?? []).map((r: { user_id: string; naam: string | null; afdeling: string | null }) => [r.user_id, { naam: r.naam }]))

    const { data: profielen, error: profError } = await supabase.from('profiles').select('user_id, geboortedatum, weergave_naam')
    if (!profError && profielen) {
      function datumInVenster(maand: number, dag: number): string | null {
        const mm = String(maand).padStart(2, '0')
        const dd = String(dag).padStart(2, '0')
        const dit = `${huidigJaar}-${mm}-${dd}`
        if (dit >= vandaagStr && dit <= eindDatumStr) return dit
        const volgend = `${huidigJaar + 1}-${mm}-${dd}`
        if (volgend >= vandaagStr && volgend <= eindDatumStr) return volgend
        return null
      }
      for (const p of profielen) {
        const rec = p as Record<string, unknown>
        const userId = String(rec.user_id ?? '')
        const naam = (typeof rec.weergave_naam === 'string' ? rec.weergave_naam : null) || rollenMap.get(userId)?.naam || userId
        const voornaam = naam.split(' ')[0] ?? naam
        if (typeof rec.geboortedatum === 'string' && rec.geboortedatum) {
          try {
            const delen = rec.geboortedatum.slice(0, 10).split('-')
            const maand = parseInt(delen[1], 10)
            const dag = parseInt(delen[2], 10)
            const datum = datumInVenster(maand, dag)
            if (datum) items.push({ type: 'jarig', naam: voornaam, label: `${dag} ${MAAND_NAMEN[maand - 1]} · Verjaardag`, datum, vandaag: datum === vandaagStr })
          } catch { /* skip */ }
        }
      }
    }

    items.sort((a, b) => {
      if (a.vandaag && !b.vandaag) return -1
      if (!a.vandaag && b.vandaag) return 1
      return a.datum.localeCompare(b.datum)
    })
    return { items }
  } catch {
    return { items: [] }
  }
}

async function haalRssOp(url: string, limit: number): Promise<BrancheNieuwsData> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8', 'User-Agent': 'DynamoTV/1.0' },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 300 },
    })
    if (!res.ok) return { items: [] }
    const rawItems = parseBrancheNieuwsRss(await res.text(), limit)
    return {
      items: rawItems.map(item => ({ titel: item.title, url: item.link, datum: item.pubDate ?? null })),
    }
  } catch {
    return { items: [] }
  }
}

export default async function TvPage() {
  const supabase = createAdminClient()
  const brancheRss = process.env.NIEUWSFIETS_RSS_URL?.trim() || 'https://nieuwsfiets.nu/category/nieuws/feed/'

  const [nieuws, mededelingen, weer, initRuimtes, initVieringen, initBrancheNieuws, initNuNl] = await Promise.all([
    haalNieuwsOp(supabase),
    haalMededelingenOp(supabase),
    haalWeerOp(),
    haalRuimtesOp(),
    haalVieringenOp(supabase),
    haalRssOp(brancheRss, 8),
    haalRssOp('https://www.nu.nl/rss/Algemeen', 10),
  ])

  return (
    <TvClient
      nieuws={nieuws}
      mededelingen={mededelingen}
      weer={weer}
      initRuimtes={initRuimtes}
      initVieringen={initVieringen}
      initBrancheNieuws={initBrancheNieuws}
      initNuNl={initNuNl}
    />
  )
}
