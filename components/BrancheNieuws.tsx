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

export const BRANCHE_NIEUWS_MEER_URL = 'https://nieuwsfiets.nu/meer-nieuws/'

type Props = {
  /** Aantal headlines in de moduletegel (compact) */
  maxItems?: number
}

/**
 * Alleen de inhoud voor de moduletegel: headlines + laadstatus.
 * Kaart-frame (icoon, titel, footer) staat op het dashboard.
 */
export function BrancheNieuwsModule({ maxItems = 3 }: Props) {
  const { data, isLoading, error } = useSWR<Payload>(`/api/branche-nieuws?limit=${maxItems + 2}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  })

  const items = (Array.isArray(data?.items) ? data.items : []).slice(0, maxItems)
  const moreUrl = data?.moreUrl ?? BRANCHE_NIEUWS_MEER_URL

  if (isLoading) {
    return (
      <ul className="space-y-2.5 mt-1 animate-pulse">
        {[1, 2, 3].map(i => (
          <li key={i} className="h-3 bg-gray-100 rounded" style={{ width: `${92 - i * 6}%` }} />
        ))}
      </ul>
    )
  }

  if (error || data?.error) {
    return (
      <p className="text-xs mt-1 leading-snug" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
        Niet geladen.{' '}
        <Link href={moreUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: DYNAMO_BLUE }}>
          NieuwsFiets
        </Link>
      </p>
    )
  }

  if (items.length === 0) {
    return <p className="text-xs mt-1" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Geen artikelen.</p>
  }

  return (
    <ul className="mt-3 space-y-2.5">
      {items.map((it, idx) => (
        <li key={`${it.link}-${idx}`}>
          <a
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs font-medium leading-snug hover:underline line-clamp-2"
            style={{ color: DYNAMO_BLUE, fontFamily: F }}
            onClick={e => e.stopPropagation()}
          >
            {it.title}
          </a>
          {formatPub(it.pubDate) && (
            <span className="block text-[10px] mt-0.5" style={{ color: 'rgba(45,69,124,0.38)', fontFamily: F }}>
              {formatPub(it.pubDate)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
