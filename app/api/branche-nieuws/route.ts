import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { parseBrancheNieuwsRss } from '@/lib/branche-nieuws-rss'

/** Standaard: categorie Nieuws (zelfde als overzicht op /meer-nieuws/). Overschrijfbaar via env. */
const DEFAULT_RSS =
  process.env.NIEUWSFIETS_RSS_URL?.trim() || 'https://nieuwsfiets.nu/category/nieuws/feed/'

const MEER_NIEUWS_URL = 'https://nieuwsfiets.nu/meer-nieuws/'

/** GET: laatste branche-artikelen (RSS), alleen voor ingelogde gebruikers */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Math.min(12, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 8))

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 12_000)

  try {
    const res = await fetch(DEFAULT_RSS, {
      signal: ac.signal,
      headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8' },
      cache: 'no-store',
    })
    clearTimeout(t)
    if (!res.ok) {
      return NextResponse.json(
        { error: `RSS niet bereikbaar (${res.status})`, items: [], moreUrl: MEER_NIEUWS_URL },
        { status: 502 }
      )
    }
    const xml = await res.text()
    const items = parseBrancheNieuwsRss(xml, limit)
    return NextResponse.json({
      items,
      moreUrl: MEER_NIEUWS_URL,
      sourceName: 'NieuwsFiets',
      feedUrl: DEFAULT_RSS,
    })
  } catch (e: unknown) {
    clearTimeout(t)
    const msg = e instanceof Error && e.name === 'AbortError' ? 'RSS-timeout' : 'RSS ophalen mislukt'
    return NextResponse.json({ error: msg, items: [], moreUrl: MEER_NIEUWS_URL }, { status: 502 })
  }
}
