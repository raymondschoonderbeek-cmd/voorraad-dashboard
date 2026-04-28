'use client'

import { useEffect, useState } from 'react'
import TvStage from '@/components/tv/TvStage'
import TvHeader, { type WeerItem } from '@/components/tv/TvHeader'
import TvNewsCard, { type NewsItem } from '@/components/tv/TvNewsCard'
import TvAnnouncements, { type MededelingItem } from '@/components/tv/TvAnnouncements'
import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'

interface TvClientProps {
  nieuws: NewsItem[]
  mededelingen: MededelingItem[]
  weer: WeerItem[]
}

export default function TvClient({ nieuws, mededelingen, weer: initWeer }: TvClientProps) {
  const [nu, setNu] = useState(() => new Date())
  const [nieuwsIdx, setNieuwsIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const [huidigWeer, setHuidigWeer] = useState<WeerItem[]>(initWeer)

  // Klok — elke seconde
  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Nieuws rouleren elke 20 seconden
  useEffect(() => {
    if (nieuws.length <= 1) return
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setNieuwsIdx(i => (i + 1) % nieuws.length)
        setFade(true)
      }, 600)
    }, 20_000)
    return () => clearInterval(t)
  }, [nieuws.length])

  // Weer elke 10 minuten verversen
  useEffect(() => {
    async function verversWeer() {
      try {
        const res = await fetch('/api/weer?plaatsen=Amersfoort,Turnhout')
        if (res.ok) {
          const data = (await res.json()) as WeerItem[]
          if (Array.isArray(data) && data.length > 0) setHuidigWeer(data)
        }
      } catch { /* stil falen */ }
    }
    const t = setInterval(verversWeer, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const huidigNieuws = nieuws[nieuwsIdx] ?? null

  return (
    <TvStage>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--drg-bg)',
          padding: 0,
        }}
      >
        {/* HEADER */}
        <TvHeader nu={nu} weer={huidigWeer} />

        {/* BENTO GRID */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gridTemplateRows: 'repeat(4, 1fr)',
            gap: 20,
            padding: '20px 36px 36px',
            minHeight: 0,
          }}
        >
          {/* NIEUWS — col 1-7, row 1-4 */}
          {huidigNieuws ? (
            <TvNewsCard item={huidigNieuws} opacity={fade ? 1 : 0} />
          ) : (
            <div
              style={{
                gridColumn: '1 / 8',
                gridRow: '1 / 5',
                background: 'var(--drg-card)',
                border: '1px solid var(--drg-line)',
                borderRadius: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: DYNAMO_BLUE_LIGHT,
                }}
              >
                Geen nieuws beschikbaar
              </div>
            </div>
          )}

          {/* MEDEDELINGEN — col 8-12, row 1-4 */}
          <TvAnnouncements mededelingen={mededelingen} />
        </div>
      </div>
    </TvStage>
  )
}
