'use client'

import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'

export interface AanwezigPersoon {
  naam: string
  afdeling: string
}

export interface AanwezigheidData {
  aanwezig: AanwezigPersoon[]
  oof: { naam: string }[]
}

interface TvPresenceCardProps {
  data: AanwezigheidData | null
  style?: React.CSSProperties
}

export default function TvPresenceCard({ data, style }: TvPresenceCardProps) {
  const aanwezig = data?.aanwezig ?? []
  const aantalAanwezig = aanwezig.length

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: DYNAMO_BLUE_LIGHT,
          }}
        >
          Wie is er vandaag
        </div>
        {aantalAanwezig > 0 && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'rgba(22,163,74,0.10)',
              color: 'var(--drg-success)',
            }}
          >
            {aantalAanwezig} aanwezig
          </div>
        )}
      </div>

      {/* Grid met personen */}
      {aanwezig.length === 0 ? (
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
          Niemand aanwezig
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px 16px',
            flex: 1,
            alignContent: 'start',
          }}
        >
          {aanwezig.map((persoon, idx) => (
            <div
              key={idx}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
            >
              {/* Groene dot */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--drg-success)',
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
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
                  {persoon.naam}
                </div>
                {persoon.afdeling && (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--drg-text-3)',
                      marginTop: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {persoon.afdeling}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
