'use client'

import { useEffect, useState } from 'react'
import { useRotator } from '@/components/tv/useRotator'
import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'

const PAGE_SIZE = 8

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
  const oof = data?.oof ?? []

  const aantalPaginas = Math.max(1, Math.ceil(oof.length / PAGE_SIZE))
  const paginaIdx = useRotator(aantalPaginas, 5000)
  const [zichtbaar, setZichtbaar] = useState(oof.slice(0, PAGE_SIZE))
  const [fade, setFade] = useState(true)

  useEffect(() => {
    setFade(false)
    const t = setTimeout(() => {
      setZichtbaar(oof.slice(paginaIdx * PAGE_SIZE, (paginaIdx + 1) * PAGE_SIZE))
      setFade(true)
    }, 300)
    return () => clearTimeout(t)
  }, [paginaIdx, oof])

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
          Wie is er afwezig
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {oof.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(234,88,12,0.08)', color: '#ea580c' }}>
              {oof.length} afwezig
            </span>
          )}
          {aantalPaginas > 1 && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {Array.from({ length: aantalPaginas }).map((_, i) => (
                <div key={i} style={{ width: i === paginaIdx ? 14 : 5, height: 5, borderRadius: 99, background: i === paginaIdx ? '#ea580c' : 'rgba(234,88,12,0.2)', transition: 'width 0.3s, background 0.3s' }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {oof.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--drg-text-3)' }}>
          Iedereen aanwezig
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', flex: 1, alignContent: 'start', opacity: fade ? 1 : 0, transition: 'opacity 0.3s' }}>
          {zichtbaar.map((persoon, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ea580c', flexShrink: 0, marginTop: 3 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--drg-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
