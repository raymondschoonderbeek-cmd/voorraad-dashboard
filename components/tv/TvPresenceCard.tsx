'use client'

import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'

export interface AanwezigPersoon {
  naam: string
  afdeling: string
}

export interface OofPersoon {
  naam: string
  afdeling: string
  terug: string | null
}

export interface AanwezigheidData {
  aanwezig: AanwezigPersoon[]
  oof: OofPersoon[]
}

interface TvPresenceCardProps {
  data: AanwezigheidData | null
  style?: React.CSSProperties
}

export default function TvPresenceCard({ data, style }: TvPresenceCardProps) {
  const aanwezig = data?.aanwezig ?? []
  const oof = data?.oof ?? []
  const totaal = aanwezig.length + oof.length

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
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: DYNAMO_BLUE_LIGHT }}>
          Wie is er vandaag
        </div>
        {totaal > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {aanwezig.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(22,163,74,0.10)', color: 'var(--drg-success)' }}>
                {aanwezig.length} aanwezig
              </span>
            )}
            {oof.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(234,88,12,0.08)', color: '#ea580c' }}>
                {oof.length} OOF
              </span>
            )}
          </div>
        )}
      </div>

      {totaal === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--drg-text-3)' }}>
          Niemand aanwezig
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', flex: 1, alignContent: 'start' }}>
          {/* Aanwezigen eerst */}
          {aanwezig.map((persoon, idx) => (
            <div key={`a-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--drg-success)', flexShrink: 0, marginTop: 3 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {persoon.naam}
                </div>
                {persoon.afdeling && (
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--drg-text-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {persoon.afdeling}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* OOF — gedempt, met terugdatum */}
          {oof.map((persoon, idx) => (
            <div key={`o-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, opacity: 0.55 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', flexShrink: 0, marginTop: 3 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'line-through', textDecorationColor: 'rgba(45,69,124,0.3)' }}>
                  {persoon.naam}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#ea580c', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {persoon.terug ?? 'OOF'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
