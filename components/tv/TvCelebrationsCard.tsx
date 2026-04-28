'use client'

import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import type { VieringItem, VieringType } from '@/app/api/tv/vieringen/route'

// Re-export voor gebruik elders
export type { VieringItem, VieringType }

export interface VieringenData {
  items: VieringItem[]
}

interface TvCelebrationsCardProps {
  data: VieringenData | null
  style?: React.CSSProperties
}

function vieringIcoon(type: VieringType): string {
  switch (type) {
    case 'jarig':    return '🎂'
    case 'jubileum': return '🏆'
    case 'nieuw':    return '👋'
  }
}

export default function TvCelebrationsCard({ data, style }: TvCelebrationsCardProps) {
  const items = data?.items ?? []

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
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: DYNAMO_BLUE_LIGHT,
          marginBottom: 16,
        }}
      >
        Vandaag bij DRG
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: 'var(--drg-text-3)',
          }}
        >
          Niets te vieren vandaag
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}
            >
              {/* Icoon */}
              <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
                {vieringIcoon(item.type)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--drg-ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.naam}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--drg-text-2)',
                    marginTop: 1,
                  }}
                >
                  {item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
