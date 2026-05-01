'use client'

import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import type { JoanRoom } from '@/lib/joan'

interface TvRoomsCardProps {
  ruimtes: JoanRoom[]
  style?: React.CSSProperties
}

function StatusDot({ bezet }: { bezet: boolean }) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: bezet ? 'var(--drg-danger)' : 'var(--drg-success)',
        flexShrink: 0,
        marginTop: 2,
      }}
    />
  )
}

function statusTekst(ruimte: JoanRoom): string {
  if (!ruimte.bezet) {
    const eersteBoeking = ruimte.boekingen[0]
    if (!eersteBoeking) return 'vrij vandaag'
    return `vrij tot ${eersteBoeking.van}`
  }
  return ruimte.tot ? `t/m ${ruimte.tot} bezet` : 'bezet'
}

export default function TvRoomsCard({ ruimtes, style }: TvRoomsCardProps) {
  const zichtbaar = ruimtes.slice(0, 6)
  const aantalVrij = ruimtes.filter(r => !r.bezet).length
  const totaal = ruimtes.length

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
          Ruimtes
        </div>
        {totaal > 0 && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 20,
              background: aantalVrij > 0 ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.10)',
              color: aantalVrij > 0 ? 'var(--drg-success)' : 'var(--drg-danger)',
            }}
          >
            {aantalVrij}/{totaal} vrij
          </div>
        )}
      </div>

      {/* Grid */}
      {zichtbaar.length === 0 ? (
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
          Geen ruimtes beschikbaar
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
          {zichtbaar.map(ruimte => (
            <div
              key={ruimte.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <StatusDot bezet={ruimte.bezet} />
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
                  {ruimte.naam}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: ruimte.bezet ? 'var(--drg-danger)' : 'var(--drg-success)',
                    marginTop: 1,
                  }}
                >
                  {statusTekst(ruimte)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
