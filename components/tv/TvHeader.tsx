'use client'

import { DYNAMO_BLUE, DYNAMO_BLUE_LIGHT } from '@/lib/theme'

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

function weerIcoon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 65) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}

export interface WeerItem {
  naam: string
  temp: number
  code: number
}

interface TvHeaderProps {
  nu: Date
  weer: WeerItem[]
}

export default function TvHeader({ nu, weer }: TvHeaderProps) {
  const dagNaam = DAGEN[nu.getDay()]
  const datum = `${nu.getDate()} ${MAANDEN[nu.getMonth()]} ${nu.getFullYear()}`
  const uren = String(nu.getHours()).padStart(2, '0')
  const minuten = String(nu.getMinutes()).padStart(2, '0')

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 36px',
        height: 88,
        background: DYNAMO_BLUE,
        flexShrink: 0,
      }}
    >
      {/* Naam */}
      <div style={{ display: 'flex', flexDirection: 'column', width: 280 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#FFFFFF', lineHeight: 1.1 }}>
          Dynamo
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)', marginTop: 3 }}>
          Retail Group
        </div>
      </div>

      {/* Datum + Klok */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: DYNAMO_BLUE_LIGHT,
          }}
        >
          {dagNaam} · {datum}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            fontFamily: 'var(--font-geist-mono, monospace)',
          }}
        >
          {uren}:{minuten}
        </div>
      </div>

      {/* Weer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32, width: 280, justifyContent: 'flex-end' }}>
        {weer.map(w => (
          <div key={w.naam} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{weerIcoon(w.code)}</span>
            <div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: '#FFFFFF',
                }}
              >
                {w.temp}°
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: DYNAMO_BLUE_LIGHT,
                  marginTop: 2,
                }}
              >
                {w.naam}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
