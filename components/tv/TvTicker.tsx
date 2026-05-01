'use client'

import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'

export interface TickerItem {
  titel: string
  url: string
  datum: string | null
}

export interface BrancheNieuwsData {
  items: TickerItem[]
}

interface TvTickerProps {
  data: BrancheNieuwsData | null
  label?: string
  style?: React.CSSProperties
}

const SEPARATOR = '   ·   '
// ~60px per seconde — pas aan via NEXT_PUBLIC_TV_TICKER_PX_PER_S
const PX_PER_S =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TV_TICKER_PX_PER_S
    ? Number(process.env.NEXT_PUBLIC_TV_TICKER_PX_PER_S) || 80
    : 80
// Schatting: gemiddeld 10px per karakter bij fontSize 17 / fontWeight 500
const PX_PER_CHAR = 10

export default function TvTicker({ data, label = 'Nieuws', style }: TvTickerProps) {
  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div
        style={{
          background: 'var(--drg-card)',
          border: '1px solid var(--drg-line)',
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '0 24px',
          overflow: 'hidden',
          height: 64,
          ...style,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: DYNAMO_BLUE_LIGHT, flexShrink: 0 }}>
          {label}
        </div>
        <div style={{ width: 1, height: 28, background: 'var(--drg-line)', flexShrink: 0 }} />
        <div style={{ fontSize: 13, color: 'var(--drg-text-3)' }}>Geen nieuws beschikbaar</div>
      </div>
    )
  }

  // Alle titels aaneengevoegd met separator, daarna verdubbeld voor naadloze loop
  const strip = items.map(i => i.titel).join(SEPARATOR) + SEPARATOR
  const dubbel = strip + strip

  // Animatieduur op basis van geschatte tekstbreedte van één strip
  const geschatteBreedtePx = strip.length * PX_PER_CHAR
  const duurS = Math.round(geschatteBreedtePx / PX_PER_S)

  return (
    <div
      style={{
        background: 'var(--drg-card)',
        border: '1px solid var(--drg-line)',
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '0 24px',
        overflow: 'hidden',
        height: 64,
        ...style,
      }}
    >
      {/* Label */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: DYNAMO_BLUE_LIGHT, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {label}
      </div>

      {/* Scheidingslijn */}
      <div style={{ width: 1, height: 28, background: 'var(--drg-line)', flexShrink: 0 }} />

      {/* Scrollende tekst */}
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--drg-ink)',
            animation: `tv-ticker-lopen ${duurS}s linear infinite`,
            willChange: 'transform',
          }}
        >
          {dubbel}
        </div>
      </div>
    </div>
  )
}
