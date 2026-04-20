'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { normalizeBodyHtml } from '@/lib/news-body'

const BLAUW = '#2D457C'
const BLAUW_LICHT = '#6691AE'
const F = "'Outfit', sans-serif"

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const DAGEN_LANG = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

type NewsItem = {
  id: string
  title: string
  excerpt: string | null
  body_html: string | null
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

type Weer = { stad: string; temp: number; label: string; icon: string }

type Hoogtepunt = { id: string; datum: string; naam: string; icoon: string }

type Ruimte = { id: string; naam: string; bezet: boolean; tot?: string; geboektDoor?: string }

type TvData = {
  nieuws: NewsItem[]
  mededelingen: Mededeling[]
  jarigen: Jarige[]
  hoogtepunten: Hoogtepunt[]
  weer: Weer[]
  ruimtes: Ruimte[]
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
      const res = await fetch('/api/tv-data', { cache: 'no-store' })
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
  const hoogtepunten = data?.hoogtepunten ?? []
  const ruimtes = data?.ruimtes ?? []

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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dynamo-retail-group-logo-tv.png"
            alt="Dynamo Retail Group"
            style={{
              objectFit: 'contain',
              height: '6vh',
              width: 'auto',
              display: 'block',
            }}
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
        {(data?.weer?.length ?? 0) > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
            {data!.weer.map(w => (
              <div key={w.stad} style={{ display: 'flex', alignItems: 'center', gap: '0.5vw', textAlign: 'right' }}>
                <span style={{ fontSize: '3.5vh' }}>{w.icon}</span>
                <div>
                  <div style={{ fontSize: '2.8vh', fontWeight: 700, lineHeight: 1 }}>{w.temp}°C</div>
                  <div style={{ fontSize: '1.1vh', color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.04em' }}>{w.stad}</div>
                </div>
              </div>
            ))}
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

              {/* Scheidingslijn */}
              <div style={{ height: '1px', background: 'rgba(102,145,174,0.25)', marginBottom: '2.5vh', flexShrink: 0 }} />

              {/* Inhoud: body_html als die er is, anders excerpt */}
              {(bericht.body_html || bericht.excerpt) && (
                <div style={{
                  fontSize: 'clamp(1.8vh, 2.3vh, 2.8vh)',
                  lineHeight: 1.75,
                  color: 'rgba(255,255,255,0.82)',
                  fontWeight: 400,
                  flex: 1,
                  minHeight: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {bericht.body_html ? (
                    <div
                      className="tv-nieuws-body"
                      dangerouslySetInnerHTML={{ __html: normalizeBodyHtml(bericht.body_html) }}
                      style={{ maxHeight: '100%', overflow: 'hidden' }}
                    />
                  ) : (
                    <p style={{ margin: 0 }}>{bericht.excerpt}</p>
                  )}
                  {/* Vervaagde onderkant zodat afgekapte tekst netjes verdwijnt */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '6vh',
                    background: 'linear-gradient(to bottom, transparent, #1a2e5a)',
                    pointerEvents: 'none',
                  }} />
                </div>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1vh' }}>
                {komendJarig.slice(0, 5).map(j => {
                  const verjaardagDatum = new Date()
                  verjaardagDatum.setDate(verjaardagDatum.getDate() + j.dagenTot)
                  const dagNaam = DAGEN_LANG[verjaardagDatum.getDay()]
                  return (
                    <div key={j.naam} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1vw' }}>
                      <span style={{ fontSize: '2vh', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{j.naam}</span>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '1.6vh', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
                          {dagNaam}
                        </div>
                        <div style={{ fontSize: '1.4vh', color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
                          {j.dag} {MAANDEN[j.maand - 1]}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Maand hoogtepunten */}
          {hoogtepunten.length > 0 && (
            <div style={{
              background: 'rgba(102,145,174,0.07)',
              border: '1px solid rgba(102,145,174,0.18)',
              borderRadius: '1.5vh',
              padding: '2vh 1.8vw',
            }}>
              <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLAUW_LICHT, marginBottom: '1.2vh' }}>
                Hoogtepunten
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9vh' }}>
                {hoogtepunten.slice(0, 4).map(h => {
                  const d = new Date(h.datum + 'T00:00:00')
                  const isVandaag = h.datum === new Date().toISOString().slice(0, 10)
                  return (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1vw' }}>
                      <span style={{ fontSize: '2vh', fontWeight: isVandaag ? 700 : 600, color: isVandaag ? 'white' : 'rgba(255,255,255,0.82)' }}>
                        {h.icoon} {h.naam}
                      </span>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '1.6vh', color: isVandaag ? '#f0c040' : 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                          {isVandaag ? 'vandaag' : DAGEN_LANG[d.getDay()]}
                        </div>
                        <div style={{ fontSize: '1.4vh', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>
                          {d.getDate()} {MAANDEN[d.getMonth()]}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ruimtes beschikbaarheid */}
          {ruimtes.length > 0 && (
            <div style={{
              background: 'rgba(102,145,174,0.07)',
              border: '1px solid rgba(102,145,174,0.18)',
              borderRadius: '1.5vh',
              padding: '2vh 1.8vw',
            }}>
              <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLAUW_LICHT, marginBottom: '1.2vh' }}>
                Ruimtes
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
                {ruimtes.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                    <div style={{
                      width: '1vh',
                      height: '1vh',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: r.bezet ? '#ef4444' : '#22c55e',
                      boxShadow: r.bezet ? '0 0 6px rgba(239,68,68,0.5)' : '0 0 6px rgba(34,197,94,0.5)',
                    }} />
                    <span style={{ fontSize: '1.8vh', fontWeight: 600, color: 'rgba(255,255,255,0.85)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.naam}
                    </span>
                    <span style={{ fontSize: '1.4vh', fontWeight: 500, flexShrink: 0, color: r.bezet ? 'rgba(239,68,68,0.85)' : 'rgba(34,197,94,0.85)' }}>
                      {r.bezet ? (r.tot ? `bezet t/m ${r.tot}` : 'bezet') : 'vrij'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spacer als geen content */}
          {vandaagJarig.length === 0 && komendJarig.length === 0 && hoogtepunten.length === 0 && ruimtes.length === 0 && (
            <div style={{ flex: 1 }} />
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
        .tv-nieuws-body { font-size: inherit; line-height: inherit; }
        .tv-nieuws-body p { margin: 0 0 1.8vh 0; }
        .tv-nieuws-body p:last-child { margin-bottom: 0; }
        .tv-nieuws-body br + br { display: block; margin-top: 1.4vh; }
        .tv-nieuws-body ul { margin: 0 0 1.8vh 0; padding: 0; list-style: none; }
        .tv-nieuws-body ol { margin: 0 0 1.8vh 0; padding: 0; list-style: none; counter-reset: tv-ol; }
        .tv-nieuws-body ul li { padding-left: 1.4em; position: relative; margin-bottom: 0.8vh; }
        .tv-nieuws-body ul li::before { content: '—'; position: absolute; left: 0; color: #6691AE; }
        .tv-nieuws-body ol li { padding-left: 1.8em; position: relative; margin-bottom: 0.8vh; counter-increment: tv-ol; }
        .tv-nieuws-body ol li::before { content: counter(tv-ol) '.'; position: absolute; left: 0; color: #6691AE; font-weight: 700; }
        .tv-nieuws-body strong, .tv-nieuws-body b { color: white; font-weight: 700; }
        .tv-nieuws-body em, .tv-nieuws-body i { color: rgba(255,255,255,0.7); font-style: italic; }
        .tv-nieuws-body h1, .tv-nieuws-body h2, .tv-nieuws-body h3 { color: white; font-weight: 700; margin: 0 0 1.2vh 0; line-height: 1.2; }
        .tv-nieuws-body h2 { font-size: 1.15em; }
        .tv-nieuws-body h3 { font-size: 1.05em; }
        .tv-nieuws-body a { color: #6691AE; text-decoration: none; }
        .tv-nieuws-body img { display: none; }
        .tv-nieuws-body hr { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 2vh 0; }
        .tv-nieuws-body blockquote { border-left: 3px solid #6691AE; padding-left: 1.2vw; margin: 0 0 1.8vh 0; color: rgba(255,255,255,0.65); font-style: italic; }
        .tv-nieuws-body table { display: none; }
      `}</style>
    </div>
  )
}
