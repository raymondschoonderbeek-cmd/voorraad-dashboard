import TvClient from './TvClient'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NewsItem } from '@/components/tv/TvNewsCard'
import type { MededelingItem } from '@/components/tv/TvAnnouncements'
import type { WeerItem } from '@/components/tv/TvHeader'

/**
 * TV-pagina (server component) — haalt data direct uit Supabase + Open-Meteo.
 * Geen auth-check nodig: middleware (cookie tv_access) dekt de route al af.
 */

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
    .select('id, tekst, sort_order')
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

export default async function TvPage() {
  const supabase = createAdminClient()
  const [nieuws, mededelingen, weer] = await Promise.all([
    haalNieuwsOp(supabase),
    haalMededelingenOp(supabase),
    haalWeerOp(),
  ])

  return (
    <TvClient
      nieuws={nieuws}
      mededelingen={mededelingen}
      weer={weer}
    />
  )
}
