'use client'

import Image from 'next/image'
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
  return `${d.getDate()} ${MAANDEN_KORT[d.getMonth()]} ${d.getFullYear()}`
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

function extractEersteAfbeelding(html: string | null): string | null {
  if (!html) return null
  const match = html.match(/<img[^>]+src="([^"]+)"/)
  return match?.[1] ?? null
}

function stripHtml(html: string | null): string | null {
  if (!html) return null
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null
}

export default function TvNewsCard({ item, opacity = 1 }: TvNewsCardProps) {
  const coverAfbeelding = item.image_url ?? extractEersteAfbeelding(item.body_html)
  const heeftAfbeelding = Boolean(coverAfbeelding)
  const introTekst = item.excerpt ?? stripHtml(item.body_html)

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
      }}
    >
      {/* Fotogedeelte */}
      {heeftAfbeelding && (
        <div style={{ position: 'relative', height: 200, flexShrink: 0 }}>
          <Image
            src={coverAfbeelding!}
            alt={item.title}
            fill
            style={{ objectFit: 'cover' }}
            sizes="800px"
            unoptimized
          />
        </div>
      )}

      {/* Tekst-gedeelte */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: heeftAfbeelding ? '28px 36px 32px' : '44px 48px 40px',
          minHeight: 0,
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: item.is_important ? 'var(--drg-accent)' : DYNAMO_BLUE_LIGHT,
            marginBottom: 16,
          }}
        >
          {item.is_important ? '⚡ Belangrijk · ' : ''}{categorieLabel(item.category)}
        </div>

        {/* Headline */}
        <h2
          style={{
            fontSize: heeftAfbeelding ? 34 : 42,
            fontWeight: 700,
            lineHeight: 1.05,
            color: DYNAMO_BLUE,
            margin: '0 0 20px',
            textWrap: 'balance',
          } as React.CSSProperties}
        >
          {item.title}
        </h2>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: 'var(--drg-line)',
            marginBottom: 20,
            flexShrink: 0,
          }}
        />

        {/* Intro tekst */}
        {introTekst && (
          <p
            style={{
              fontSize: 17,
              fontWeight: 400,
              lineHeight: 1.45,
              color: 'var(--drg-ink)',
              margin: 0,
              flex: 1,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: heeftAfbeelding ? 3 : 6,
              WebkitBoxOrient: 'vertical',
            } as React.CSSProperties}
          >
            {introTekst}
          </p>
        )}

        {/* Datum */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 20,
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--drg-text-3)',
          }}
        >
          {formatDatum(item.published_at)}
        </div>
      </div>
    </div>
  )
}
