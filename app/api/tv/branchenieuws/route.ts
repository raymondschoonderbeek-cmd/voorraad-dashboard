import { NextRequest, NextResponse } from 'next/server'
import { parseBrancheNieuwsRss } from '@/lib/branche-nieuws-rss'

const DEFAULT_RSS =
  process.env.NIEUWSFIETS_RSS_URL?.trim() || 'https://nieuwsfiets.nu/category/nieuws/feed/'

/**
 * Publiek TV-endpoint — geen user-auth vereist.
 * Haalt branchenieuws RSS op en retourneert max 8 items.
 */
export async function GET(request: NextRequest) {
  const limit = Math.min(
    8,
    Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 8)
  )

  try {
    const res = await fetch(DEFAULT_RSS, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'User-Agent': 'DynamoTV/1.0',
      },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { items: [], error: `RSS niet bereikbaar (${res.status})` },
        { status: 502 }
      )
    }

    const xml = await res.text()
    const rawItems = parseBrancheNieuwsRss(xml, limit)

    const items = rawItems.map(item => ({
      titel: item.title,
      url: item.link,
      datum: item.pubDate ?? null,
    }))

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: unknown) {
    const msg = e instanceof Error && e.name === 'AbortError' ? 'RSS-timeout' : 'RSS ophalen mislukt'
    return NextResponse.json({ items: [], error: msg }, { status: 502 })
  }
}
