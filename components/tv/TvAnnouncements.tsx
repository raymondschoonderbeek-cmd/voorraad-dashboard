'use client'

import { DYNAMO_BLUE, DYNAMO_BLUE_LIGHT } from '@/lib/theme'

export interface MededelingItem {
  id: string
  tekst: string
  sort_order: number
}

interface TvAnnouncementsProps {
  mededelingen: MededelingItem[]
}

export default function TvAnnouncements({ mededelingen }: TvAnnouncementsProps) {
  const zichtbaar = mededelingen.slice(0, 3)

  return (
    <div
      style={{
        gridColumn: '8 / 13',
        gridRow: '1 / 5',
        background: 'var(--drg-card)',
        border: '1px solid var(--drg-line)',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 32px 36px',
        overflow: 'hidden',
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
          marginBottom: 24,
        }}
      >
        Mededelingen
      </div>

      {/* Lijst */}
      {zichtbaar.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--drg-text-3)',
            fontSize: 15,
          }}
        >
          Geen mededelingen
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {zichtbaar.map((m, idx) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                paddingBottom: idx < zichtbaar.length - 1 ? 20 : 0,
                borderBottom: idx < zichtbaar.length - 1
                  ? '1px solid var(--drg-line)'
                  : 'none',
              }}
            >
              {/* Nummer-pill */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div
                  style={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: DYNAMO_BLUE,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginTop: 1,
                  }}
                >
                  {idx + 1}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 19,
                    fontWeight: 600,
                    lineHeight: 1.4,
                    color: 'var(--drg-ink)',
                  }}
                >
                  {m.tekst}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
