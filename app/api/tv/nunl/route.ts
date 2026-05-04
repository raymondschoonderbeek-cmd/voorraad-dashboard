import { NextResponse } from 'next/server'
import { parseBrancheNieuwsRss } from '@/lib/branche-nieuws-rss'

const NU_NL_RSS = 'https://www.nu.nl/rss/Algemeen'

export async function GET() {
  try {
    const res = await fetch(NU_NL_RSS, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'User-Agent': 'DynamoTV/1.0',
      },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json({ items: [] }, { status: 502 })
    }

    const rawItems = parseBrancheNieuwsRss(await res.text(), 10)
    const items = rawItems.map(item => ({
      titel: item.title,
      url: item.link,
      datum: item.pubDate ?? null,
    }))

    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
