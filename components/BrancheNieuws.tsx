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
  /** Aantal headlines in de moduletegel */
  maxItems?: number
}

/**
 * Inhoud voor de moduletegel: headlines + laadstatus (typografie gelijk aan andere moduletegels).
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
      <div className="mt-5 flex flex-col gap-4 animate-pulse" aria-hidden>
        {[0, 1, 2].map(i => (
          <div key={i} className="border-b border-[rgba(45,69,124,0.08)] pb-4 last:border-0 last:pb-0">
            <div className="h-4 bg-[rgba(45,69,124,0.08)] rounded-md" style={{ width: `${100 - i * 8}%` }} />
            <div className="h-3 bg-[rgba(45,69,124,0.05)] rounded mt-2 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (error || data?.error) {
    return (
      <p className="text-sm mt-5 leading-relaxed" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
        Niet geladen.{' '}
        <Link href={moreUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: DYNAMO_BLUE }}>
          Open NieuwsFiets
        </Link>
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <p className="text-sm mt-5 leading-relaxed" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
        Geen artikelen op dit moment.
      </p>
    )
  }

  return (
    <ul className="mt-5 flex flex-col gap-0">
      {items.map((it, idx) => (
        <li
          key={`${it.link}-${idx}`}
          className="border-b border-[rgba(45,69,124,0.1)] pb-4 last:border-0 last:pb-0"
        >
          <a
            href={it.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block rounded-lg -mx-1 px-1 py-0.5 transition-colors hover:bg-[rgba(45,69,124,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[rgba(45,69,124,0.35)]"
            style={{ fontFamily: F }}
            onClick={e => e.stopPropagation()}
          >
            <span
              className="block text-sm font-semibold leading-snug group-hover:underline line-clamp-3"
              style={{ color: DYNAMO_BLUE }}
            >
              {it.title}
            </span>
            {formatPub(it.pubDate) && (
              <span className="block text-[11px] font-medium mt-1.5 tracking-wide" style={{ color: 'rgba(45,69,124,0.42)', fontFamily: F }}>
                {formatPub(it.pubDate)}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}
