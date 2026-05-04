'use client'

import { DYNAMO_BLUE, DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import { IconMegaphone } from '@/components/DashboardIcons'

const MAAND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MAAND_KORT[d.getMonth()]}`
}

export interface MededelingItem {
  id: string
  tekst: string
  label?: string | null
  geldig_tot?: string | null
  sort_order: number
}

interface TvAnnouncementsProps {
  mededelingen: MededelingItem[]
  verjaardagen?: string[]
}

export default function TvAnnouncements({ mededelingen, verjaardagen = [] }: TvAnnouncementsProps) {
  const zichtbaar = mededelingen.slice(0, 5 - Math.min(verjaardagen.length, 2))

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
      {/* Header met megafoon-icoon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <span style={{ color: DYNAMO_BLUE_LIGHT, display: 'flex' }}>
          <IconMegaphone size={14} />
        </span>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: DYNAMO_BLUE_LIGHT }}>
          Mededelingen
        </div>
      </div>

      {/* Lijst */}
      {verjaardagen.length === 0 && zichtbaar.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--drg-text-3)', fontSize: 15 }}>
          Geen mededelingen
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1 }}>
          {/* Verjaardagen — altijd bovenaan */}
          {verjaardagen.map((naam, idx) => (
            <div
              key={`verjaardag-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                paddingBottom: 20,
                marginBottom: 20,
                borderBottom: '1px solid rgba(201,161,74,0.25)',
                background: 'linear-gradient(90deg, rgba(201,161,74,0.10) 0%, transparent 100%)',
                borderRadius: 10,
                padding: '12px 14px',
              }}
            >
              <div style={{
                flexShrink: 0,
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(201,161,74,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                lineHeight: 1,
              }}>
                🎂
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--drg-accent)', lineHeight: 1.2 }}>
                  Gefeliciteerd, {naam}!
                </div>
                <div style={{ fontSize: 13, color: 'rgba(201,161,74,0.75)', marginTop: 3, fontWeight: 500 }}>
                  🎉 Vandaag jarig
                </div>
              </div>
            </div>
          ))}
          {zichtbaar.map((m, idx) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                paddingBottom: idx < zichtbaar.length - 1 ? 20 : 0,
                marginBottom: idx < zichtbaar.length - 1 ? 20 : 0,
                borderBottom: idx < zichtbaar.length - 1 ? '1px solid var(--drg-line)' : 'none',
              }}
            >
              {/* Label-badge */}
              {m.label && (
                <div style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'rgba(45,69,124,0.08)',
                  color: DYNAMO_BLUE,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                }}>
                  {m.label}
                </div>
              )}

              {/* Tekst + deadline */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35, color: 'var(--drg-ink)' }}>
                  {m.tekst}
                </div>
                {m.geldig_tot && (
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--drg-text-3)', marginTop: 4 }}>
                    <strong style={{ color: DYNAMO_BLUE }}>{formatDeadline(m.geldig_tot)}</strong>
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
