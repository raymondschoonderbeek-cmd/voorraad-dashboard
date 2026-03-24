'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { DYNAMO_BLUE, dashboardUi } from '@/lib/theme'

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
  /** Compacte marges en 2 regels titel — past in vaste tegelhoogte met scroll */
  compact?: boolean
}

/**
 * Inhoud voor de moduletegel: headlines + laadstatus (typografie gelijk aan andere moduletegels).
 */
export function BrancheNieuwsModule({ maxItems = 3, compact = false }: Props) {
  const { data, isLoading, error } = useSWR<Payload>(`/api/branche-nieuws?limit=${maxItems + 2}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  })

  const items = (Array.isArray(data?.items) ? data.items : []).slice(0, maxItems)
  const moreUrl = data?.moreUrl ?? BRANCHE_NIEUWS_MEER_URL

  const mt = compact ? 'mt-2' : 'mt-5'
  const gapItem = compact ? 'pb-2.5 last:pb-0' : 'pb-4 last:pb-0'

  if (isLoading) {
    return (
      <div className={`${mt} flex flex-col ${compact ? 'gap-2' : 'gap-4'} animate-pulse`} aria-hidden>
        {[0, 1, 2].map(i => (
          <div key={i} className={`border-b border-[rgba(45,69,124,0.08)] ${gapItem}`}>
            <div className="h-3.5 bg-[rgba(45,69,124,0.08)] rounded-md" style={{ width: `${100 - i * 8}%` }} />
            <div className="h-2.5 bg-[rgba(45,69,124,0.05)] rounded mt-1.5 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (error || data?.error) {
    return (
      <p className={`text-sm ${mt} leading-relaxed`} style={{ color: dashboardUi.textMuted, fontFamily: F }}>
        Niet geladen.{' '}
        <Link href={moreUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: DYNAMO_BLUE }}>
          Open NieuwsFiets
        </Link>
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <p className={`text-sm ${mt} leading-relaxed`} style={{ color: dashboardUi.textMuted, fontFamily: F }}>
        Geen artikelen op dit moment.
      </p>
    )
  }

  const titleClamp = compact ? 'line-clamp-2' : 'line-clamp-3'
  const titleSize = compact ? 'text-[13px]' : 'text-sm'

  return (
    <ul className={`${mt} flex flex-col gap-0`}>
      {items.map((it, idx) => (
        <li
          key={`${it.link}-${idx}`}
          className={`border-b border-[rgba(45,69,124,0.1)] ${gapItem} ${compact ? 'last:border-b-0' : ''}`}
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
              className={`block font-semibold leading-snug group-hover:underline ${titleClamp} ${titleSize}`}
              style={{ color: DYNAMO_BLUE }}
            >
              {it.title}
            </span>
            {formatPub(it.pubDate) && (
              <span className={`block text-[10px] font-medium tracking-wide ${compact ? 'mt-0.5' : 'mt-1.5'}`} style={{ color: 'rgba(45,69,124,0.42)', fontFamily: F }}>
                {formatPub(it.pubDate)}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}
