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

type Boeking = { van: string; tot: string }
type Ruimte = { id: string; naam: string; bezet: boolean; tot?: string; geboektDoor?: string; capacity: number; boekingen: Boeking[] }
type NieuwsItem = { title: string; link: string; pubDate: string | null }

type TvData = {
  nieuws: NewsItem[]
  mededelingen: Mededeling[]
  jarigen: Jarige[]
  hoogtepunten: Hoogtepunt[]
  weer: Weer[]
  ruimtes: Ruimte[]
  brancheNieuws: NieuwsItem[]
  nuNieuws: NieuwsItem[]
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

type ZijpanelView = 'verjaardagen' | 'hoogtepunten'
type LinkerView = 'intern' | 'branche'

export default function TvPage() {
  const [data, setData] = useState<TvData | null>(null)
  const [nu, setNu] = useState(new Date())
  const [nieuwsIdx, setNieuwsIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const [linkerView, setLinkerView] = useState<LinkerView>('intern')
  const [linkerFade, setLinkerFade] = useState(true)
  const [zijpanelView, setZijpanelView] = useState<ZijpanelView>('verjaardagen')
  const [zijpanelFade, setZijpanelFade] = useState(true)
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

  // Linkerkolom wisselen: intern ↔ branche nieuws elke 30 seconden
  useEffect(() => {
    if (!data?.brancheNieuws?.length) return
    const t = setInterval(() => {
      setLinkerFade(false)
      setTimeout(() => {
        setLinkerView(v => v === 'intern' ? 'branche' : 'intern')
        setLinkerFade(true)
      }, 600)
    }, 30000)
    return () => clearInterval(t)
  }, [data?.brancheNieuws?.length])

  // Zijpanel rouleren: verjaardagen ↔ hoogtepunten elke 8 seconden
  useEffect(() => {
    const heeftVerjaardagen = (data?.jarigen?.length ?? 0) > 0
    const heeftHoogtepunten = (data?.hoogtepunten?.length ?? 0) > 0
    if (!heeftVerjaardagen || !heeftHoogtepunten) return
    const views: ZijpanelView[] = ['verjaardagen', 'hoogtepunten']
    const t = setInterval(() => {
      setZijpanelFade(false)
      setTimeout(() => {
        setZijpanelView(v => views[(views.indexOf(v) + 1) % views.length])
        setZijpanelFade(true)
      }, 500)
    }, 8000)
    return () => clearInterval(t)
  }, [data?.jarigen?.length, data?.hoogtepunten?.length])

  const bericht = data?.nieuws?.[nieuwsIdx] ?? null
  const vandaagJarig = data?.jarigen?.filter(j => j.vandaag) ?? []
  const komendJarig = data?.jarigen?.filter(j => !j.vandaag) ?? []
  const hoogtepunten = data?.hoogtepunten ?? []
  const ruimtes = data?.ruimtes ?? []
  const brancheNieuws = data?.brancheNieuws ?? []
  const nuNieuws = data?.nuNieuws ?? []

  const tickerSegmenten: { tekst: string; label?: string }[] = [
    ...(data?.mededelingen ?? []).map(m => ({ tekst: m.tekst })),
    ...nuNieuws.map(n => ({ tekst: n.title, label: 'NU.NL' })),
  ]
  const tickerTekst = tickerSegmenten.length
    ? tickerSegmenten.map(s => s.label ? `${s.label}  ${s.tekst}` : s.tekst).join('   ·   ')
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

        {/* LINKS: INTERN NIEUWS ↔ BRANCHE NIEUWS */}
        <div style={{
          flex: '0 0 60%',
          display: 'flex',
          flexDirection: 'column',
          padding: '3vh 2.5vw 2vh 2.5vw',
          borderRight: '1px solid rgba(102,145,174,0.15)',
          overflow: 'hidden',
        }}>
          {/* Label + tab-indicators */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2vh' }}>
            <div style={{ fontSize: '1.2vh', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: BLAUW_LICHT }}>
              {linkerView === 'intern' ? 'Intern Nieuws' : 'Branche Nieuws'}
            </div>
            {brancheNieuws.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4vw' }}>
                {(['intern', 'branche'] as LinkerView[]).map(v => (
                  <div key={v} style={{
                    width: v === linkerView ? '1.5vw' : '0.5vw',
                    height: '0.4vh',
                    borderRadius: '100px',
                    background: v === linkerView ? BLAUW_LICHT : 'rgba(255,255,255,0.2)',
                    transition: 'all 0.4s ease',
                  }} />
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, transition: 'opacity 0.6s ease', opacity: linkerFade ? 1 : 0, display: 'flex', flexDirection: 'column' }}>

            {/* INTERN NIEUWS */}
            {linkerView === 'intern' && (
              bericht ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', transition: 'opacity 0.6s ease', opacity: fade ? 1 : 0 }}>
                  <div style={{ marginBottom: '2vh' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.4vh 1.2vw',
                      borderRadius: '100px',
                      fontSize: '1.2vh',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      background: bericht.is_important ? 'rgba(240,192,64,0.18)' : 'rgba(102,145,174,0.18)',
                      color: bericht.is_important ? '#f0c040' : BLAUW_LICHT,
                      border: `1px solid ${bericht.is_important ? 'rgba(240,192,64,0.35)' : 'rgba(102,145,174,0.35)'}`,
                    }}>
                      {bericht.is_important ? '⚡ Belangrijk · ' : ''}{categorieLabel(bericht.category)}
                    </span>
                  </div>
                  <h1 style={{ fontSize: 'clamp(2.8vh, 4.5vh, 5.5vh)', fontWeight: 800, lineHeight: 1.15, margin: '0 0 2.5vh', color: 'white', letterSpacing: '-0.02em' }}>
                    {bericht.title}
                  </h1>
                  <div style={{ height: '1px', background: 'rgba(102,145,174,0.25)', marginBottom: '2.5vh', flexShrink: 0 }} />
                  {(bericht.body_html || bericht.excerpt) && (
                    <div style={{ fontSize: 'clamp(1.8vh, 2.3vh, 2.8vh)', lineHeight: 1.75, color: 'rgba(255,255,255,0.82)', fontWeight: 400, flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
                      {bericht.body_html ? (
                        <div className="tv-nieuws-body" dangerouslySetInnerHTML={{ __html: normalizeBodyHtml(bericht.body_html) }} style={{ maxHeight: '100%', overflow: 'hidden' }} />
                      ) : (
                        <p style={{ margin: 0 }}>{bericht.excerpt}</p>
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6vh', background: 'linear-gradient(to bottom, transparent, #1a2e5a)', pointerEvents: 'none' }} />
                    </div>
                  )}
                  <div style={{ marginTop: '3vh', display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
                    <span style={{ fontSize: '1.3vh', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                      {new Date(bericht.published_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
                    </span>
                    {(data?.nieuws?.length ?? 0) > 1 && (
                      <div style={{ display: 'flex', gap: '0.4vw' }}>
                        {data!.nieuws.map((_, i) => (
                          <div key={i} style={{ width: i === nieuwsIdx ? '2vw' : '0.5vw', height: '0.5vh', borderRadius: '100px', background: i === nieuwsIdx ? BLAUW_LICHT : 'rgba(255,255,255,0.2)', transition: 'all 0.4s ease' }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '2vh' }}>
                  Geen nieuws beschikbaar
                </div>
              )
            )}

            {/* BRANCHE NIEUWS */}
            {linkerView === 'branche' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2vh' }}>
                {brancheNieuws.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5vw', borderBottom: i < brancheNieuws.length - 1 ? '1px solid rgba(102,145,174,0.12)' : 'none', paddingBottom: i < brancheNieuws.length - 1 ? '2vh' : 0 }}>
                    <div style={{ fontSize: '1.4vh', fontWeight: 700, color: BLAUW_LICHT, flexShrink: 0, minWidth: '2.5vw', lineHeight: 1.4, paddingTop: '0.2vh' }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 'clamp(1.6vh, 2vh, 2.4vh)', fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {item.title}
                      </p>
                      {item.pubDate && (
                        <p style={{ margin: '0.4vh 0 0', fontSize: '1.2vh', color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>
                          {new Date(item.pubDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: '1vh' }}>
                  <span style={{ fontSize: '1.1vh', color: 'rgba(255,255,255,0.25)', fontWeight: 500 }}>Bron: NieuwsFiets.nu</span>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* RECHTS */}
        <div style={{
          flex: '0 0 40%',
          display: 'flex',
          flexDirection: 'column',
          padding: '2vh 2.5vw 2vh 2vw',
          gap: '1.8vh',
          overflow: 'hidden',
        }}>

          {/* Ruimtes beschikbaarheid — altijd bovenaan */}
          {ruimtes.length > 0 && (
            <div style={{
              background: 'rgba(102,145,174,0.07)',
              border: '1px solid rgba(102,145,174,0.18)',
              borderRadius: '1.5vh',
              padding: '1.6vh 1.8vw',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLAUW_LICHT, marginBottom: '1vh' }}>
                Ruimtes vandaag
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9vh' }}>
                {ruimtes.map(r => (
                  <div key={r.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7vw', marginBottom: '0.3vh' }}>
                      <div style={{
                        width: '0.85vh',
                        height: '0.85vh',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: r.bezet ? '#ef4444' : '#22c55e',
                        boxShadow: r.bezet ? '0 0 5px rgba(239,68,68,0.6)' : '0 0 5px rgba(34,197,94,0.6)',
                      }} />
                      <span style={{ fontSize: '1.6vh', fontWeight: 700, color: 'white', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.naam}
                      </span>
                      <span style={{ fontSize: '1.3vh', fontWeight: 500, flexShrink: 0, color: r.bezet ? '#f87171' : '#4ade80' }}>
                        {r.bezet ? `bezet t/m ${r.tot}` : 'vrij'}
                      </span>
                    </div>
                    {r.boekingen.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4vw', paddingLeft: '1.5vw' }}>
                        {r.boekingen.map((b, i) => (
                          <span key={i} style={{
                            fontSize: '1.1vh',
                            fontWeight: 500,
                            padding: '0.15vh 0.5vw',
                            borderRadius: '0.4vh',
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: 'rgba(248,113,113,0.9)',
                            whiteSpace: 'nowrap',
                          }}>
                            {b.van}–{b.tot}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roulerend zijpanel: verjaardagen ↔ hoogtepunten */}
          {(vandaagJarig.length > 0 || komendJarig.length > 0 || hoogtepunten.length > 0) && (
            <div style={{
              flex: 1,
              minHeight: 0,
              transition: 'opacity 0.5s ease',
              opacity: zijpanelFade ? 1 : 0,
              overflow: 'hidden',
            }}>
              {/* Verjaardagen */}
              {(zijpanelView === 'verjaardagen' || hoogtepunten.length === 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
                  {vandaagJarig.length > 0 && (
                    <div style={{
                      background: 'rgba(240,192,64,0.08)',
                      border: '1px solid rgba(240,192,64,0.25)',
                      borderRadius: '1.5vh',
                      padding: '1.6vh 1.8vw',
                    }}>
                      <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f0c040', marginBottom: '0.8vh' }}>
                        🎂 Vandaag Jarig
                      </div>
                      {vandaagJarig.map(j => (
                        <div key={j.naam} style={{ fontSize: '2.6vh', fontWeight: 700, color: 'white', lineHeight: 1.3 }}>
                          {j.naam}
                        </div>
                      ))}
                    </div>
                  )}
                  {komendJarig.length > 0 && (
                    <div style={{
                      background: 'rgba(102,145,174,0.07)',
                      border: '1px solid rgba(102,145,174,0.18)',
                      borderRadius: '1.5vh',
                      padding: '1.6vh 1.8vw',
                    }}>
                      <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLAUW_LICHT, marginBottom: '0.8vh' }}>
                        Komende verjaardagen
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
                        {komendJarig.map(j => {
                          const verjaardagDatum = new Date()
                          verjaardagDatum.setDate(verjaardagDatum.getDate() + j.dagenTot)
                          return (
                            <div key={j.naam} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1vw' }}>
                              <span style={{ fontSize: '1.8vh', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{j.naam}</span>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontSize: '1.4vh', color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{DAGEN_LANG[verjaardagDatum.getDay()]}</div>
                                <div style={{ fontSize: '1.2vh', color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>{j.dag} {MAANDEN[j.maand - 1]}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Hoogtepunten */}
              {zijpanelView === 'hoogtepunten' && hoogtepunten.length > 0 && (
                <div style={{
                  background: 'rgba(102,145,174,0.07)',
                  border: '1px solid rgba(102,145,174,0.18)',
                  borderRadius: '1.5vh',
                  padding: '1.6vh 1.8vw',
                }}>
                  <div style={{ fontSize: '1.1vh', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BLAUW_LICHT, marginBottom: '0.8vh' }}>
                    Hoogtepunten
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7vh' }}>
                    {hoogtepunten.map(h => {
                      const d = new Date(h.datum + 'T00:00:00')
                      const isVandaag = h.datum === new Date().toISOString().slice(0, 10)
                      return (
                        <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1vw' }}>
                          <span style={{ fontSize: '1.8vh', fontWeight: isVandaag ? 700 : 600, color: isVandaag ? 'white' : 'rgba(255,255,255,0.82)' }}>
                            {h.icoon} {h.naam}
                          </span>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '1.4vh', color: isVandaag ? '#f0c040' : 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                              {isVandaag ? 'vandaag' : DAGEN_LANG[d.getDay()]}
                            </div>
                            <div style={{ fontSize: '1.2vh', color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>
                              {d.getDate()} {MAANDEN[d.getMonth()]}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Indicatordots als beide aanwezig */}
              {(vandaagJarig.length > 0 || komendJarig.length > 0) && hoogtepunten.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5vw', marginTop: '1vh' }}>
                  {(['verjaardagen', 'hoogtepunten'] as ZijpanelView[]).map(v => (
                    <div key={v} style={{
                      width: v === zijpanelView ? '1.5vw' : '0.5vw',
                      height: '0.4vh',
                      borderRadius: '100px',
                      background: v === zijpanelView ? BLAUW_LICHT : 'rgba(255,255,255,0.2)',
                      transition: 'all 0.4s ease',
                    }} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* TICKER ONDERAAN */}
      {tickerTekst && (
        <div style={{
          height: '8vh',
          background: `linear-gradient(90deg, ${BLAUW} 0%, #1e3a6e 100%)`,
          borderTop: '1px solid rgba(102,145,174,0.25)',
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          paddingBottom: '0.5vh',
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
            {nuNieuws.length > 0 ? 'Nieuws & Mededelingen' : 'Mededelingen'}
          </div>

          {/* Scrollende tekst */}
          <div
            ref={tickerRef}
            style={{ display: 'flex', flex: 1, overflow: 'hidden' }}
          >
            {(() => {
              const items = tickerSegmenten
              const renderItems = (ariaHidden?: boolean) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap' }} aria-hidden={ariaHidden}>
                  {items.map((s, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {s.label && (
                        <span style={{
                          fontSize: '1vh',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          color: '#f0c040',
                          background: 'rgba(240,192,64,0.12)',
                          border: '1px solid rgba(240,192,64,0.3)',
                          borderRadius: '0.3vh',
                          padding: '0.1vh 0.5vw',
                          marginRight: '0.8vw',
                        }}>
                          {s.label}
                        </span>
                      )}
                      <span style={{ fontSize: '2vh', fontWeight: 500, color: 'rgba(255,255,255,0.9)' }}>
                        {s.tekst}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 3vw' }}>·</span>
                    </span>
                  ))}
                </span>
              )
              return (
                <div style={{
                  display: 'flex',
                  whiteSpace: 'nowrap',
                  animation: `ticker-scroll ${Math.max(40, tickerSegmenten.length * 8)}s linear infinite`,
                  alignItems: 'center',
                  paddingLeft: '3vw',
                }}>
                  {renderItems()}
                  {renderItems(true)}
                </div>
              )
            })()}
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
