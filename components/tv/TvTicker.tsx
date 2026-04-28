'use client'

import { useState, useEffect } from 'react'
import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import { useRotator } from './useRotator'

const INTERVAL_MS =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TV_TICKER_MS
    ? Number(process.env.NEXT_PUBLIC_TV_TICKER_MS) || 6000
    : 6000

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
  style?: React.CSSProperties
}

export default function TvTicker({ data, style }: TvTickerProps) {
  const items = data?.items ?? []
  const rawIndex = useRotator(items.length, INTERVAL_MS)

  // Crossfade: fade out → wissel → fade in
  const [zichtbaarIndex, setZichtbaarIndex] = useState(0)
  const [opacity, setOpacity] = useState(1)
  const [translateY, setTranslateY] = useState(0)

  useEffect(() => {
    if (items.length <= 1) {
      setZichtbaarIndex(rawIndex)
      return
    }
    // Fade uit
    setOpacity(0)
    setTranslateY(6)
    const timer = setTimeout(() => {
      setZichtbaarIndex(rawIndex)
      setOpacity(1)
      setTranslateY(0)
    }, 600)
    return () => clearTimeout(timer)
  }, [rawIndex, items.length])

  const huidigItem = items[zichtbaarIndex] ?? null

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
      {/* Eyebrow */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: DYNAMO_BLUE_LIGHT,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        Branchenieuws
      </div>

      {/* Scheidingslijn */}
      <div
        style={{
          width: 1,
          height: 28,
          background: 'var(--drg-line)',
          flexShrink: 0,
        }}
      />

      {/* Ticker tekst */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {huidigItem ? (
          <div
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--drg-ink)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity,
              transform: `translateY(${translateY}px)`,
              transition: 'opacity 0.6s ease, transform 0.6s ease',
            }}
          >
            {huidigItem.titel}
          </div>
        ) : (
          <div
            style={{ fontSize: 13, color: 'var(--drg-text-3)' }}
          >
            Geen branchenieuws beschikbaar
          </div>
        )}
      </div>

      {/* Dot-indicators */}
      {items.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {items.map((_, idx) => (
            <div
              key={idx}
              style={{
                height: 6,
                borderRadius: 3,
                background: idx === zichtbaarIndex ? 'var(--drg-accent)' : 'rgba(14,23,38,0.18)',
                width: idx === zichtbaarIndex ? 16 : 6,
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
