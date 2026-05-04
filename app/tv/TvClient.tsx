'use client'

import useSWR from 'swr'
import { useEffect, useState } from 'react'
import TvStage from '@/components/tv/TvStage'
import TvHeader, { type WeerItem } from '@/components/tv/TvHeader'
import TvNewsCard, { type NewsItem } from '@/components/tv/TvNewsCard'
import TvAnnouncements, { type MededelingItem } from '@/components/tv/TvAnnouncements'
import TvRoomsCard from '@/components/tv/TvRoomsCard'
import TvBrancheNieuwsCard from '@/components/tv/TvBrancheNieuwsCard'
import TvCelebrationsCard, { type VieringenData } from '@/components/tv/TvCelebrationsCard'
import TvTicker, { type BrancheNieuwsData } from '@/components/tv/TvTicker'
import { DYNAMO_BLUE_LIGHT } from '@/lib/theme'
import type { JoanRoom } from '@/lib/joan'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface TvClientProps {
  nieuws: NewsItem[]
  mededelingen: MededelingItem[]
  weer: WeerItem[]
  initRuimtes: JoanRoom[]
  initVieringen: VieringenData
  initBrancheNieuws: BrancheNieuwsData
  initNuNl: BrancheNieuwsData
}

export default function TvClient({
  nieuws,
  mededelingen,
  weer: initWeer,
  initRuimtes,
  initVieringen,
  initBrancheNieuws,
  initNuNl,
}: TvClientProps) {
  const [nu, setNu] = useState(() => new Date())
  const [nieuwsIdx, setNieuwsIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const [huidigWeer, setHuidigWeer] = useState<WeerItem[]>(initWeer)

  // Ruimtes — elke 60s vernieuwen
  const { data: ruimtesData } = useSWR<JoanRoom[]>('/api/ruimtes', fetcher, {
    refreshInterval: 60_000,
    fallbackData: initRuimtes,
  })

  // Vieringen — elke 30 minuten vernieuwen; SSR-fallback
  const { data: vieringenData } = useSWR<VieringenData>(
    '/api/tv/vieringen',
    fetcher,
    { refreshInterval: 30 * 60_000, fallbackData: initVieringen }
  )

  // Branchenieuws (kaart) — elke 5 minuten vernieuwen; SSR-fallback
  const { data: brancheNieuwsData } = useSWR<BrancheNieuwsData>(
    '/api/tv/branchenieuws',
    fetcher,
    { refreshInterval: 5 * 60_000, fallbackData: initBrancheNieuws }
  )

  // Nu.nl (ticker) — elke 5 minuten vernieuwen; SSR-fallback
  const { data: nuNlData } = useSWR<BrancheNieuwsData>(
    '/api/tv/nunl',
    fetcher,
    { refreshInterval: 5 * 60_000, fallbackData: initNuNl }
  )

  // Klok — elke seconde
  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Pagina-refresh elke 5 minuten — houdt nieuws, mededelingen en ruimtes actueel
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 5 * 60_000)
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
  const ruimtes: JoanRoom[] = ruimtesData ?? initRuimtes
  const verjaardagenVandaag = (vieringenData ?? initVieringen).items
    .filter(v => v.type === 'jarig' && v.vandaag)
    .map(v => v.naam)

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
            gridTemplateRows: 'repeat(6, 1fr)',
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
          <TvAnnouncements mededelingen={mededelingen} verjaardagen={verjaardagenVandaag} />

          {/* RUIMTES — col 1-4, row 5-6 */}
          <TvRoomsCard
            ruimtes={ruimtes}
            style={{ gridColumn: '1 / 5', gridRow: '5 / 7' }}
          />

          {/* BRANCHENIEUWS — col 5-8, row 5-6 */}
          <TvBrancheNieuwsCard
            data={brancheNieuwsData ?? null}
            style={{ gridColumn: '5 / 9', gridRow: '5 / 7' }}
          />

          {/* VIERINGEN — col 9-12, row 5-6 */}
          <TvCelebrationsCard
            data={vieringenData ?? null}
            style={{ gridColumn: '9 / 13', gridRow: '5 / 7' }}
          />
        </div>

        {/* TICKER — nu.nl nieuws */}
        <div style={{ padding: '0 36px 20px', flexShrink: 0 }}>
          <TvTicker data={nuNlData ?? null} label="Nu.nl" style={{ height: 64 }} />
        </div>
      </div>
    </TvStage>
  )
}
