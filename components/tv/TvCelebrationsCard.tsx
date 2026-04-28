'use client'

import { DYNAMO_BLUE, DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import type { VieringItem, VieringType } from '@/app/api/tv/vieringen/route'

export type { VieringItem, VieringType }

export interface VieringenData {
  items: VieringItem[]
}

interface TvCelebrationsCardProps {
  data: VieringenData | null
  style?: React.CSSProperties
}

const MAAND_NAMEN = [
  'januari','februari','maart','april','mei','juni',
  'juli','augustus','september','oktober','november','december',
]

function VieringDot({ type }: { type: VieringType }) {
  const kleur = type === 'jarig' ? 'var(--drg-accent)' : type === 'jubileum' ? DYNAMO_BLUE : type === 'hoogtepunt' ? 'var(--drg-warn)' : 'var(--drg-success)'
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: kleur, flexShrink: 0, marginTop: 3,
    }} />
  )
}

function typeLabel(type: VieringType): string {
  if (type === 'jarig') return 'Verjaardag'
  if (type === 'jubileum') return 'Jubileum'
  if (type === 'hoogtepunt') return 'Hoogtepunt'
  return 'Nieuw'
}

export default function TvCelebrationsCard({ data, style }: TvCelebrationsCardProps) {
  const items = data?.items ?? []
  const nu = new Date()
  const maandNaam = MAAND_NAMEN[nu.getMonth()]

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
          Bij DRG — {maandNaam}
        </div>
        {items.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE }}>
            {items.length}
          </div>
        )}
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--drg-text-3)' }}>
          Niets deze maand
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'hidden' }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: item.vandaag ? '6px 10px' : '0',
                borderRadius: item.vandaag ? 8 : 0,
                background: item.vandaag ? 'rgba(45,69,124,0.06)' : 'transparent',
                margin: item.vandaag ? '0 -10px' : '0',
              }}
            >
              {/* Hoogtepunt toont eigen emoji, rest een dot */}
              {item.type === 'hoogtepunt' && item.icoon
                ? <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, width: 16, textAlign: 'center' }}>{item.icoon}</span>
                : <VieringDot type={item.type} />
              }
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.naam}
                  </span>
                  {item.vandaag && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: DYNAMO_BLUE, background: 'rgba(45,69,124,0.12)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                      vandaag
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--drg-text-2)', marginTop: 1 }}>
                  {item.type !== 'hoogtepunt' ? `${typeLabel(item.type)} · ` : ''}{item.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
