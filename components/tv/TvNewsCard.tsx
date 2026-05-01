'use client'

import { useEffect, useRef, useState } from 'react'
import { DYNAMO_BLUE, DYNAMO_BLUE_LIGHT } from '@/lib/theme'

const MAANDEN_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function categorieLabel(cat: string): string {
  const map: Record<string, string> = {
    algemeen: 'Algemeen', hr: 'HR', it: 'IT',
    commercieel: 'Commercieel', operationeel: 'Operationeel', financieel: 'Financieel',
  }
  return map[cat] ?? cat
}

function formatDatum(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function extractEersteAfbeelding(html: string | null): string | null {
  if (!html) return null
  const match = html.match(/<img[^>]+src="([^"]+)"/)
  return match?.[1] ?? null
}


export interface NewsItem {
  id: string
  title: string
  excerpt: string | null
  body_html: string | null
  category: string
  is_important: boolean
  published_at: string
  image_url?: string | null
}

interface TvNewsCardProps {
  item: NewsItem
  opacity?: number
}

export default function TvNewsCard({ item, opacity = 1 }: TvNewsCardProps) {
  const coverAfbeelding = item.image_url ?? (!item.body_html ? null : extractEersteAfbeelding(item.body_html))
  const gebruikHtml = !!item.body_html
  const plainTekst = !gebruikHtml ? (item.excerpt ?? null) : null

  const wrapperRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scrollCss, setScrollCss] = useState<React.CSSProperties>({})

  useEffect(() => {
    const outer = wrapperRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const overflow = inner.scrollHeight - outer.clientHeight
    if (overflow > 30) {
      const duur = Math.max(12, overflow / 28)
      setScrollCss({
        '--tv-scroll-dist': `-${overflow}px`,
        animation: `tv-nieuws-scroll ${duur}s ease-in-out 2s infinite`,
      } as React.CSSProperties)
    } else {
      setScrollCss({})
    }
  }, [item])

  return (
    <div
      style={{
        gridColumn: '1 / 8',
        gridRow: '1 / 5',
        background: 'var(--drg-card)',
        border: '1px solid var(--drg-line)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'opacity 0.6s ease',
        opacity,
        padding: '32px 40px 32px',
      }}
    >
      {/* Eyebrow: categorie + datum */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: item.is_important ? 'var(--drg-accent)' : DYNAMO_BLUE_LIGHT }}>
          {item.is_important ? '⚡ ' : ''}{categorieLabel(item.category)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--drg-text-3)' }}>·</span>
        <span style={{ fontSize: 11, color: 'var(--drg-text-3)' }}>{formatDatum(item.published_at)}</span>
      </div>

      {/* Headline */}
      <h2
        style={{
          fontSize: 38,
          fontWeight: 700,
          lineHeight: 1.1,
          color: DYNAMO_BLUE,
          margin: '0 0 18px',
          flexShrink: 0,
          textWrap: 'balance',
        } as React.CSSProperties}
      >
        {item.title}
      </h2>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--drg-line)', marginBottom: 20, flexShrink: 0 }} />

      {/* Scrollende inhoud */}
      <div ref={wrapperRef} style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <div ref={innerRef} style={scrollCss}>
          {gebruikHtml ? (
            <div
              className="tv-nieuws-body"
              dangerouslySetInnerHTML={{ __html: item.body_html! }}
            />
          ) : (
            <>
              {plainTekst && (
                <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--drg-ink)', margin: '0 0 20px' }}>
                  {plainTekst}
                </p>
              )}
              {coverAfbeelding && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverAfbeelding}
                  alt={item.title}
                  style={{ maxWidth: '55%', height: 'auto', borderRadius: 10, display: 'block' }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
