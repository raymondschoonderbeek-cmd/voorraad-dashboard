'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

const BLAUW = '#2D457C'
const BLAUW_LICHT = '#6691AE'
const F = "'Outfit', sans-serif"

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const DAGEN_LANG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

type NewsItem = {
  id: string
  title: string
  excerpt: string | null
  category: string
  is_important: boolean
  published_at: string
}

type Mededeling = { id: string; tekst: string; sort_order: number }

type Jarige = {
  naam: string
  dag: number
  maand: number
  dagenTot: number
  vandaag: boolean
}

type Weer = { temp: number; label: string; icon: string }

type TvData = {
  nieuws: NewsItem[]
  mededelingen: Mededeling[]
  jarigen: Jarige[]
  weer: Weer | null
}

function tijdString(d: Date) {
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

function datumString(d: Date) {
  return `${DAGEN_LANG[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]} ${d.getFullYear()}`
}

function categorieLabel(cat: string) {
  const map: Record<string, string> = {
    algemeen: 'Algemeen',
    hr: 'HR',
    it: 'IT',
    commercieel: 'Commercieel',
    operationeel: 'Operationeel',
    financieel: 'Financieel',
  }
  return map[cat] ?? cat
}

export default function TvPage() {
  const [data, setData] = useState<TvData | null>(null)
  const [nu, setNu] = useState(new Date())
  const [nieuwsIdx, setNieuwsIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const tickerRef = useRef<HTMLDivElement>(null)

  const laadData = useCallback(async () => {
    try {
      const res = await fetch('/api/public/tv-data', { cache: 'no-store' })
      if (res.ok) setData(await res.json() as TvData)
    } catch { /* stil falen */ }
  }, [])

  // Klok elke seconde
  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Data elke 5 minuten verversen
  useEffect(() => {
    void laadData()
    const t = setInterval(() => void laadData(), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [laadData])

  // Nieuws wisselen elke 12 seconden met fade
  useEffect(() => {
    if (!data?.nieuws?.length) return
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setNieuwsIdx(i => (i + 1) % data.nieuws.length)
        setFade(true)
      }, 600)
    }, 12000)
    return () => clearInterval(t)
  }, [data?.nieuws?.length])

  const bericht = data?.nieuws?.[nieuwsIdx] ?? null
  const vandaagJarig = data?.jarigen?.filter(j => j.vandaag) ?? []
  const komendJarig = data?.jarigen?.filter(j => !j.vandaag) ?? []

  const tickerTekst = data?.mededelingen?.length
    ? data.mededelingen.map(m => m.tekst).join('   •   ')
    : ''

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: F,
      background: 'linear-gradient(160deg, #0d1830 0%, #1a2e5a 50%, #0f2040 100%)',
      color: 'white',
      overflow: 'hidden',
    }}>

      {/* TOPBAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2.5vw',
        height: '10vh',
        background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(102,145,174,0.2)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dynamo-retail-group-logo.png"
            alt="Dynamo Retail Group"
            style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', height: '5vh', width: 'auto', display: 'block' }}
          />
        </div>

        {/* Datum + Tijd */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.4vh', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
            {datumString(nu)}
          </div>
          <div style={{ fontSize: '5vh', fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em', color: 'white' }}>
            {tijdString(nu)}
          </div>
        </div>

        {/* Weer */}
        {data?.weer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw', textAlign: 'right' }}>
            <span style={{ fontSize: '4.5vh' }}>{data.weer.icon}</span>
            <div>
              <div style={{ fontSize: '3.5vh', fontWeight: 700, lineHeight: 1 }}>{data.weer.temp}°C</div>
              <div style={{ fontSize: '1.3vh', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{data.weer.label}</div>
            </div>
          </div>
        ) : (
          <div style={{ width: '12vw' }} />
        )}
      </div>

      {/* HOOFDINHOUD */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }}>

        {/* LINKS: INTERN NIEUWS */}
        <div style={{
          flex: '0 0 60%',
          display: 'flex',
          flexDirection: 'column',
          padding: '3vh 2.5vw 2vh 2.5vw',
          borderRight: '1px solid rgba(102,145,174,0.15)',
          overflow: 'hidden',
        }}>
          <div style={{
            fontSize: '1.2vh',
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: BLAUW_LICHT,
            marginBottom: '2vh',
          }}>
            Intern Nieuws
          </div>

          {bericht ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              transition: 'opacity 0.6s ease',
              opacity: fade ? 1 : 0,
            }}>
              {/* Categorie badge */}
              <div style={{ marginBottom: '2vh' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '0.4vh 1.2vw',
                  borderRadius: '100px',
                  fontSize: '1.2vh',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: bericht.is_important
                    ? 'rgba(240,192,64,0.18)'
                    : 'rgba(102,145,174,0.18)',
                  color: bericht.is_important ? '#f0c040' : BLAUW_LICHT,
                  border: `1px solid ${bericht.is_important ? 'rgba(240,192,64,0.35)' : 'rgba(102,145,174,0.35)'}`,
                }}>
                  {bericht.is_important ? '⚡ Belangrijk · ' : ''}{categorieLabel(bericht.category)}
                </span>
              </div>

              {/* Titel */}
              <h1 style={{
                fontSize: 'clamp(2.8vh, 4.5vh, 5.5vh)',
                fontWeight: 800,
                lineHeight: 1.15,
                margin: '0 0 2.5vh',
                color: 'white',
                letterSpacing: '-0.02em',
              }}>
                {bericht.title}
              </h1>

              {/* Samenvatting */}
              {bericht.excerpt && (
                <p style={{
                  fontSize: 'clamp(1.8vh, 2.4vh, 3vh)',
                  lineHeight: 1.65,
                  color: 'rgba(255,255,255,0.72)',
                  margin: 0,
                  fontWeight: 400,
                  maxWidth: '90%',
                }}>
                  {bericht.excerpt}
                </p>
              )}

              {/* Datum + paginering */}
              <div style={{
                marginTop: '3vh',
                display: 'flex',
                alignItems: 'center',
                gap: '1.5vw',
              }}>
                <span style={{ fontSize: '1.3vh', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                  {new Date(bericht.published_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
                </span>
                {(data?.nieuws?.length ?? 0) > 1 && (
                  <div style={{ display: 'flex', gap: '0.4vw' }}>
                    {data!.nieuws.map((_, i) => (
                      <div key={i} style={{
                        width: i === nieuwsIdx ? '2vw' : '0.5vw',
                        height: '0.5vh',
                        borderRadius: '100px',
                        background: i === nieuwsIdx ? BLAUW_LICHT : 'rgba(255,255,255,0.2)',
                        transition: 'all 0.4s ease',
                      }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.25)',
              fontSize: '2vh',
            }}>
              Geen nieuws beschikbaar
            </div>
          )}
        </div>

        {/* RECHTS: JARIGEN + WEER */}
        <div style={{
          flex: '0 0 40%',
          display: 'flex',
          flexDirection: 'column',
          padding: '3vh 2.5vw 2vh 2vw',
          gap: '2.5vh',
          overflow: 'hidden',
        }}>

          {/* Vandaag jarig */}
          {vandaagJarig.length > 0 && (
            <div style={{
              background: 'rgba(240,192,64,0.08)',
              border: '1px solid rgba(240,192,64,0.25)',
              borderRadius: '1.5vh',
              padding: '2vh 1.8vw',
            }}>
              <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f0c040', marginBottom: '1.2vh' }}>
                🎂 Vandaag Jarig
              </div>
              {vandaagJarig.map(j => (
                <div key={j.naam} style={{ fontSize: '3vh', fontWeight: 700, color: 'white', lineHeight: 1.3 }}>
                  {j.naam}
                </div>
              ))}
            </div>
          )}

          {/* Komende verjaardagen */}
          {komendJarig.length > 0 && (
            <div style={{
              background: 'rgba(102,145,174,0.07)',
              border: '1px solid rgba(102,145,174,0.18)',
              borderRadius: '1.5vh',
              padding: '2vh 1.8vw',
              flex: vandaagJarig.length === 0 ? 'none' : undefined,
            }}>
              <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLAUW_LICHT, marginBottom: '1.2vh' }}>
                Komende verjaardagen
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
                {komendJarig.slice(0, 5).map(j => (
                  <div key={j.naam} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '2vh', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{j.naam}</span>
                    <span style={{ fontSize: '1.6vh', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                      {j.dag} {MAANDEN[j.maand - 1]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spacer als geen jarigen */}
          {vandaagJarig.length === 0 && komendJarig.length === 0 && (
            <div style={{ flex: 1 }} />
          )}

          {/* Weer detail */}
          {data?.weer && (
            <div style={{
              background: 'rgba(45,69,124,0.25)',
              border: '1px solid rgba(102,145,174,0.2)',
              borderRadius: '1.5vh',
              padding: '2vh 1.8vw',
              display: 'flex',
              alignItems: 'center',
              gap: '1.5vw',
              marginTop: 'auto',
            }}>
              <span style={{ fontSize: '5vh' }}>{data.weer.icon}</span>
              <div>
                <div style={{ fontSize: '4.5vh', fontWeight: 700, lineHeight: 1, color: 'white' }}>
                  {data.weer.temp}°C
                </div>
                <div style={{ fontSize: '1.6vh', color: 'rgba(255,255,255,0.55)', fontWeight: 500, marginTop: '0.3vh' }}>
                  {data.weer.label} · Amsterdam
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TICKER ONDERAAN */}
      {tickerTekst && (
        <div style={{
          height: '6.5vh',
          background: `linear-gradient(90deg, ${BLAUW} 0%, #1e3a6e 100%)`,
          borderTop: '1px solid rgba(102,145,174,0.25)',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
        }}>
          {/* Label links */}
          <div style={{
            flexShrink: 0,
            padding: '0 1.5vw',
            fontSize: '1.1vh',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.6)',
            borderRight: '1px solid rgba(255,255,255,0.15)',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(0,0,0,0.15)',
            zIndex: 1,
          }}>
            Mededelingen
          </div>

          {/* Scrollende tekst */}
          <div
            ref={tickerRef}
            style={{
              display: 'flex',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              whiteSpace: 'nowrap',
              animation: 'ticker-scroll 60s linear infinite',
              fontSize: '2vh',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              gap: '8vw',
              paddingLeft: '3vw',
            }}>
              <span>{tickerTekst}</span>
              <span aria-hidden>{tickerTekst}</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
