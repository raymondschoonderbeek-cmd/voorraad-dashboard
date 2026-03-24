'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { DYNAMO_BLUE } from '@/lib/theme'

const F = "'Outfit', sans-serif"

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Payload = {
  items?: { title: string; link: string; pubDate: string | null }[]
  moreUrl?: string
  sourceName?: string
  error?: string
}

function formatPub(isoOrRfc: string | null): string {
  if (!isoOrRfc) return ''
  try {
    const d = new Date(isoOrRfc)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export function BrancheNieuws() {
  const { data, isLoading, error } = useSWR<Payload>('/api/branche-nieuws', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  })

  const items = Array.isArray(data?.items) ? data.items : []
  const moreUrl = data?.moreUrl ?? 'https://nieuwsfiets.nu/meer-nieuws/'
  const sourceName = data?.sourceName ?? 'NieuwsFiets'

  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm" style={{ boxShadow: '0 4px 24px rgba(45,69,124,0.08)' }}>
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2" style={{ background: 'rgba(45,69,124,0.03)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>📰</span>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
            Branche nieuws
          </span>
        </div>
        <Link
          href={moreUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold hover:underline shrink-0"
          style={{ color: DYNAMO_BLUE, fontFamily: F }}
        >
          Meer op {sourceName} →
        </Link>
      </div>
      <div className="p-4 sm:p-5">
        {isLoading && (
          <ul className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <li key={i} className="h-4 bg-gray-100 rounded" style={{ width: `${85 - i * 8}%` }} />
            ))}
          </ul>
        )}
        {!isLoading && (error || data?.error) && (
          <p className="text-sm text-gray-500" style={{ fontFamily: F }}>
            Kon branche nieuws niet laden.{' '}
            <Link href={moreUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: DYNAMO_BLUE }}>
              Open NieuwsFiets
            </Link>
          </p>
        )}
        {!isLoading && !error && !data?.error && items.length === 0 && (
          <p className="text-sm text-gray-500" style={{ fontFamily: F }}>Geen artikelen gevonden.</p>
        )}
        {!isLoading && items.length > 0 && (
          <ul className="space-y-0 divide-y divide-gray-100">
            {items.map((it, idx) => (
              <li key={`${it.link}-${idx}`} className="py-2.5 first:pt-0 last:pb-0">
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block text-sm font-medium leading-snug hover:underline"
                  style={{ color: DYNAMO_BLUE, fontFamily: F }}
                >
                  <span className="line-clamp-2">{it.title}</span>
                  {formatPub(it.pubDate) && (
                    <span className="block text-xs font-normal mt-1" style={{ color: 'rgba(45,69,124,0.45)' }}>
                      {formatPub(it.pubDate)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'rgba(45,69,124,0.35)', fontFamily: F }}>
          Bron:{' '}
          <a href={moreUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
            {sourceName} — branche- en vakhandelsnieuws
          </a>
        </p>
      </div>
    </div>
  )
}
