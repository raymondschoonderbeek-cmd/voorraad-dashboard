'use client'

import { useEffect, useState } from 'react'
import { useRotator } from '@/components/tv/useRotator'
import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import type { BrancheNieuwsData } from '@/components/tv/TvTicker'

interface TvBrancheNieuwsCardProps {
  data: BrancheNieuwsData | null
  style?: React.CSSProperties
}

const PAGE_SIZE = 4

export default function TvBrancheNieuwsCard({ data, style }: TvBrancheNieuwsCardProps) {
  const items = data?.items ?? []

  const aantalPaginas = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const paginaIdx = useRotator(aantalPaginas, 6000)
  const [zichtbaar, setZichtbaar] = useState(items.slice(0, PAGE_SIZE))
  const [fade, setFade] = useState(true)

  useEffect(() => {
    setFade(false)
    const t = setTimeout(() => {
      setZichtbaar(items.slice(paginaIdx * PAGE_SIZE, (paginaIdx + 1) * PAGE_SIZE))
      setFade(true)
    }, 300)
    return () => clearTimeout(t)
  }, [paginaIdx, items])

  return (
    <div
      style={{
        background: 'var(--drg-card)',
        border: '1px solid var(--drg-line)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        padding: '22px 24px 20px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: DYNAMO_BLUE_LIGHT }}>
          Branchenieuws
        </div>
        {aantalPaginas > 1 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {Array.from({ length: aantalPaginas }).map((_, i) => (
              <div key={i} style={{ width: i === paginaIdx ? 14 : 5, height: 5, borderRadius: 99, background: i === paginaIdx ? 'var(--drg-accent)' : 'rgba(14,23,38,0.18)', transition: 'width 0.3s, background 0.3s' }} />
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--drg-text-3)' }}>
          Geen branchenieuws beschikbaar
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, opacity: fade ? 1 : 0, transition: 'opacity 0.3s' }}>
          {zichtbaar.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--drg-accent)', flexShrink: 0, marginTop: 5 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {item.titel}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
