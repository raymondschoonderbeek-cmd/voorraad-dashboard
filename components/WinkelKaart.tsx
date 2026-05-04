'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { DYNAMO_BLUE } from '@/lib/theme'
import { IconMap, IconPin } from '@/components/DashboardIcons'
import type { Winkel } from '@/lib/types'

const F = "'Outfit', sans-serif"
const WINKEL_KLEUREN = [
  '#2D457C', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#65a30d', '#db2777',
] as const
const BIKE_TOTAAL_LOGO = '/bike-totaal-logo.png'
function isBikeTotaal(naam: string) { return /bike\s*totaal/i.test(naam) }

function isBelgischePostcode(postcode?: string | null): boolean {
  const pc = (postcode ?? '').replace(/\s/g, '')
  if (/^\d{4}$/.test(pc)) return true
  const digits = pc.replace(/\D/g, '')
  return digits.length === 4 && /^\d{4}$/.test(digits)
}

function isBelgischeWinkel(w: Winkel): boolean {
  if (w.land === 'Belgium') return true
  if (isBelgischePostcode(w.postcode)) return true
  const stadLower = (w.stad ?? '').toLowerCase()
  const belgischeSteden = ['brussel', 'brussels', 'antwerpen', 'antwerp', 'gent', 'ghent', 'liège', 'liege', 'luik', 'charleroi', 'brugge', 'bruges', 'namur', 'namen', 'leuven', 'mons', 'bergen', 'aalst', 'mechelen', 'kortrijk', 'hasselt', 'sint-niklaas', 'genk', 'roeselare', 'dendermonde', 'turnhout', 'dilbeek', 'heist-op-den-berg', 'lokeren', 'vilvoorde', 'sint-truiden', 'mouscron', 'waregem', 'geel', 'oostende', 'ostend', 'nieuwpoort', 'knokke', 'heist', 'wavre', 'nivelles', 'waterloo', 'seraing', 'verviers']
  if (belgischeSteden.some(s => stadLower.includes(s))) return true
  return false
}

export function WinkelKaartItem({ w, kleur, favoriet, onSelecteer, onToggleFavoriet }: {
  w: Winkel; kleur: string; favoriet: boolean
  onSelecteer: (w: Winkel) => void
  onToggleFavoriet: (id: number) => void
}) {
  return (
    <div className="wink-card cursor-pointer rounded-2xl overflow-hidden bg-white" style={{ boxShadow: '0 2px 12px rgba(45,69,124,0.07)', border: favoriet ? `1.5px solid ${DYNAMO_BLUE}` : '1px solid rgba(45,69,124,0.07)' }}>
      <div style={{ height: '4px', background: kleur }} />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={isBikeTotaal(w.naam) ? { background: 'white', border: '1px solid rgba(45,69,124,0.1)' } : { background: kleur }} onClick={() => onSelecteer(w)}>
            {isBikeTotaal(w.naam) ? <img src={BIKE_TOTAAL_LOGO} alt="" className="w-full h-full object-contain p-1" /> : <span className="text-white text-sm font-bold">{w.naam.charAt(0)}</span>}
          </div>
          <div className="min-w-0 flex-1" onClick={() => onSelecteer(w)}>
            <div className="font-semibold text-sm truncate" style={{ color: DYNAMO_BLUE, fontFamily: F, letterSpacing: '-0.01em' }}>{w.naam}</div>
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(45,69,124,0.35)', fontSize: '11px', fontFamily: F }}>#{w.kassa_nummer}</span>
              {w.land && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: w.land === 'Belgium' ? 'rgba(253,218,36,0.2)' : 'rgba(255,102,0,0.15)', color: w.land === 'Belgium' ? '#a16207' : '#c2410c', fontFamily: F }}>{w.land === 'Belgium' ? '🇧🇪' : '🇳🇱'}</span>
              )}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavoriet(w.id) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:opacity-70 shrink-0"
            style={{ background: favoriet ? 'rgba(45,69,124,0.08)' : 'rgba(45,69,124,0.04)', border: favoriet ? '1px solid rgba(45,69,124,0.2)' : '1px solid rgba(45,69,124,0.08)' }}
            title={favoriet ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
          >
            <span style={{ color: favoriet ? DYNAMO_BLUE : 'rgba(45,69,124,0.25)', fontSize: '14px', lineHeight: '1' }}>★</span>
          </button>
        </div>
        {(w.stad || w.postcode) ? (
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-4" style={{ background: 'rgba(45,69,124,0.04)' }} onClick={() => onSelecteer(w)}>
            <IconPin />
            <span style={{ color: 'rgba(45,69,124,0.5)', fontSize: '12px', fontFamily: F }}>{w.stad || ''}{w.stad && w.postcode ? ' · ' : ''}{w.postcode || ''}</span>
          </div>
        ) : <div className="mb-4" style={{ height: '32px' }} onClick={() => onSelecteer(w)} />}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(45,69,124,0.06)' }} onClick={() => onSelecteer(w)}>
          <span style={{ color: kleur, fontSize: '12px', fontWeight: 600, fontFamily: F }}>Bekijk details</span>
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${kleur}15` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={kleur} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

interface WinkelKaartProps {
  winkels: Winkel[]
  onSelecteer: (w: Winkel) => void
  onGeocode?: () => Promise<void>
  onGeocodeBelgium?: () => Promise<void>
  isAdmin?: boolean
  geocodeLoading?: boolean
  geocodeResult?: { bijgewerkt: number; totaal: number; mislukt: { id: number; naam: string; postcode?: string; straat?: string; stad?: string }[]; zonderAdres: { id: number; naam: string }[] } | null
  onDismissGeocodeResult?: () => void
}

export function WinkelKaart({ winkels, onSelecteer, onGeocode, onGeocodeBelgium, isAdmin, geocodeLoading, geocodeResult, onDismissGeocodeResult }: WinkelKaartProps) {
  const [toonZonderLocatieLijst, setToonZonderLocatieLijst] = useState(false)
  const winkelsMetCoords = winkels.filter(w => w.lat && w.lng)
  const mapRef = useRef<any>(null)
  const mapIdRef = useRef(`winkel-kaart-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const onSelecteerRef = useRef(onSelecteer)
  useEffect(() => { onSelecteerRef.current = onSelecteer }, [onSelecteer])

  useEffect(() => {
    if (winkelsMetCoords.length === 0) return
    if (typeof window === 'undefined') return

    const mapId = mapIdRef.current

    const initMap = () => {
      const L = (window as any).L
      if (!L) return
      const mapEl = document.getElementById(mapId)
      if (!mapEl || (mapEl as any)._leaflet_id) return

      const map = L.map(mapId, { zoomControl: true, scrollWheelZoom: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map)

      const bounds: [number, number][] = []
      winkelsMetCoords.forEach((w, i) => {
        const kleur = WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]
        const isBike = /bike\s*totaal/i.test(w.naam)
        const icon = L.divIcon({
          html: isBike
            ? `<div style="background:white;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${BIKE_TOTAAL_LOGO}" alt="" style="transform:rotate(45deg);width:20px;height:20px;object-fit:contain" /></div>`
            : `<div style="background:${kleur};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="transform:rotate(45deg);color:white;font-size:12px;font-weight:bold;text-align:center;line-height:26px;">${w.naam.charAt(0)}</div></div>`,
          className: '', iconSize: [32, 32], iconAnchor: [16, 32],
        })
        const marker = L.marker([w.lat!, w.lng!], { icon })
        marker.addTo(map)
        marker.bindPopup(`<div style="font-family:sans-serif;min-width:140px"><div style="font-weight:bold;color:${DYNAMO_BLUE};font-size:13px">${w.naam}</div><div style="color:#6b7280;font-size:11px;margin-top:2px">${w.stad || w.postcode || ''}</div><button onclick="window._selectWinkel(${w.id})" style="margin-top:8px;width:100%;background:${DYNAMO_BLUE};color:white;border:none;border-radius:6px;padding:6px;font-size:12px;cursor:pointer;font-weight:bold;">Bekijk details →</button></div>`)
        bounds.push([w.lat!, w.lng!])
      })

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [60, 60] })
      ;(window as any)._selectWinkel = (id: number) => {
        const winkel = winkels.find(w => w.id === id)
        if (winkel) onSelecteerRef.current(winkel)
      }
    }

    if ((window as any).L) {
      initMap()
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)

      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = initMap
      document.head.appendChild(script)
    }

    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove() } catch {}
        mapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winkelsMetCoords.length])

  const zonderCoords = winkels.filter(w => !w.lat || !w.lng)
  const kanGeocoden = isAdmin && zonderCoords.some(w => w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
  const belgischeWinkels = winkels.filter(w =>
    isBelgischeWinkel(w) &&
    (w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
  )
  const kanBelgieGeocoden = isAdmin && belgischeWinkels.length > 0 && !!onGeocodeBelgium

  if (winkelsMetCoords.length === 0) {
    return (
      <div className="flex flex-col justify-center" style={{ height: 380, background: 'rgba(45,69,124,0.03)', borderRadius: '16px', border: '1px dashed rgba(45,69,124,0.15)' }}>
        <div className="text-center p-6">
          <div className="flex justify-center mb-2" style={{ color: 'rgba(45,69,124,0.2)' }}><IconMap /></div>
          <p className="text-sm font-medium" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Geen kaart beschikbaar</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(45,69,124,0.3)', fontFamily: F }}>Voeg postcodes toe aan je winkels</p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {kanGeocoden && onGeocode && (
              <button onClick={onGeocode} disabled={geocodeLoading} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                {geocodeLoading ? 'Locaties ophalen...' : 'Locaties ophalen'}
              </button>
            )}
            {kanBelgieGeocoden && (
              <button onClick={onGeocodeBelgium} disabled={geocodeLoading} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'rgba(234,179,8,0.2)', color: '#a16207', border: '1px solid rgba(234,179,8,0.4)', fontFamily: F }}>
                {geocodeLoading ? 'Bezig...' : `België geocoderen (${belgischeWinkels.length})`}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {geocodeResult && onDismissGeocodeResult && (
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p style={{ color: DYNAMO_BLUE, fontWeight: 600 }}>{geocodeResult.bijgewerkt} van {geocodeResult.totaal} gegeocodeerd</p>
              {geocodeResult.zonderAdres.length > 0 && (
                <p style={{ color: 'rgba(45,69,124,0.5)', marginTop: 4 }}>{geocodeResult.zonderAdres.length} zonder adres (postcode of straat+stad ontbreekt)</p>
              )}
              {geocodeResult.mislukt.length > 0 && (
                <p style={{ color: '#b91c1c', marginTop: 4 }}>{geocodeResult.mislukt.length} mislukt (adres niet gevonden door Nominatim)</p>
              )}
            </div>
            <button onClick={onDismissGeocodeResult} className="shrink-0 rounded px-2 py-0.5 hover:bg-black/5" style={{ color: 'rgba(45,69,124,0.5)' }}>×</button>
          </div>
          {(geocodeResult.mislukt.length > 0 || geocodeResult.zonderAdres.length > 0) && (
            <Link href="/dashboard/beheer?locatie=zonder" className="inline-block mt-2 font-semibold" style={{ color: DYNAMO_BLUE }}>Bekijk in Beheer →</Link>
          )}
        </div>
      )}
      {(kanGeocoden && zonderCoords.length > 0) || kanBelgieGeocoden ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {kanGeocoden && onGeocode && zonderCoords.length > 0 && (
            <>
              <button onClick={() => setToonZonderLocatieLijst(v => !v)} className="text-xs hover:underline text-left" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
                {zonderCoords.length} winkel{zonderCoords.length !== 1 ? 's' : ''} zonder locatie {toonZonderLocatieLijst ? '▼' : '▶'}
              </button>
              <button onClick={onGeocode} disabled={geocodeLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'rgba(45,69,124,0.06)', color: DYNAMO_BLUE, fontFamily: F }}>
                {geocodeLoading ? 'Bezig...' : 'Locaties ophalen'}
              </button>
            </>
          )}
          {kanBelgieGeocoden && (
            <button onClick={onGeocodeBelgium} disabled={geocodeLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'rgba(234,179,8,0.15)', color: '#a16207', fontFamily: F }}>
              {geocodeLoading ? 'Bezig...' : `België opnieuw geocoderen (${belgischeWinkels.length})`}
            </button>
          )}
        </div>
      ) : null}
      {toonZonderLocatieLijst && zonderCoords.length > 0 && (
        <div className="rounded-xl p-3 max-h-48 overflow-y-auto text-xs" style={{ background: 'rgba(45,69,124,0.03)', border: '1px solid rgba(45,69,124,0.08)', fontFamily: F }}>
          <p className="font-semibold mb-2" style={{ color: 'rgba(45,69,124,0.6)' }}>Winkels zonder locatie</p>
          <p className="mb-2" style={{ color: 'rgba(45,69,124,0.45)' }}>Alleen winkels met postcode of straat+stad worden gegeocodeerd. <Link href="/dashboard/beheer?locatie=zonder" className="font-semibold underline" style={{ color: DYNAMO_BLUE }}>Bewerk in Beheer</Link></p>
          <ul className="space-y-1">
            {zonderCoords.map(w => {
              const heeftAdres = !!(w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
              return (
                <li key={w.id} className="flex justify-between gap-2">
                  <span style={{ color: DYNAMO_BLUE }}>{w.naam}</span>
                  <span style={{ color: heeftAdres ? 'rgba(45,69,124,0.4)' : '#b91c1c' }}>
                    {heeftAdres ? `${w.stad || ''} ${w.postcode || ''}`.trim() || '—' : 'Geen adres'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <div style={{ height: 420, borderRadius: '16px', overflow: 'hidden' }}>
        <div id={mapIdRef.current} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  )
}
