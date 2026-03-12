'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { WinkelSelect, type WinkelSelectRef } from '@/components/WinkelSelect'
import { WinkelModal } from '@/components/WinkelModal'
import { DYNAMO_BLUE } from '@/lib/theme'
import type { Winkel } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const DYNAMO_GOLD = '#f0c040'
const KOLOMMEN_STORAGE_KEY = 'dynamo_zichtbare_kolommen'
const WINKEL_STORAGE_KEY = 'dynamo_geselecteerde_winkel_id'
const F = "'Outfit', sans-serif"

const DEFAULT_MODULE_ORDER = ['voorraad', 'lunch', 'brand-groep', 'meer'] as const
type ModuleId = (typeof DEFAULT_MODULE_ORDER)[number]

const WINKEL_KLEUREN = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#65a30d', '#db2777',
] as const
const BIKE_TOTAAL_LOGO = '/bike-totaal-logo.png'
function isBikeTotaal(naam: string) { return /bike\s*totaal/i.test(naam) }

const COLUMN_CONFIG: Record<string, { label?: string; hidden?: boolean; order?: number; sticky?: boolean; format?: 'money' | 'int' | 'text'; minWidth?: number }> = {
  _type: { label: 'Type', order: 5, format: 'text' },
  PRODUCT_DESCRIPTION: { label: 'Product', order: 10, sticky: true, format: 'text' },
  BRAND_NAME: { label: 'Merk', order: 20, format: 'text' },
  BARCODE: { label: 'Barcode', order: 30, format: 'text' },
  ARTICLE_NUMBER: { label: 'Art. nummer', order: 35, format: 'text' },
  SUPPLIER_PRODUCT_NUMBER: { label: 'Leverancier art.', order: 40, format: 'text' },
  STOCK: { label: 'Voorraad', order: 50, format: 'int' },
  AVAILABLE_STOCK: { label: 'Beschikbaar', order: 60, format: 'int' },
  SALES_PRICE_INC: { label: 'Prijs incl.', order: 70, format: 'money' },
  COLOR: { label: 'Kleur', order: 75, format: 'text' },
  FRAME_HEIGHT: { label: 'Framehoogte', order: 76, format: 'text' },
  MODEL_YEAR: { label: 'Modeljaar', order: 77, format: 'text' },
  WHEEL_SIZE: { label: 'Wielmaat', order: 78, format: 'text' },
  GEAR: { label: 'Versnelling', order: 79, format: 'text' },
  LOCATION: { label: 'Locatie', order: 80, format: 'text' },
  GROUP_DESCRIPTION_1: { label: 'Groep', order: 85, format: 'text', minWidth: 140 },
  GROUP_DESCRIPTION_2: { label: 'Subgroep', order: 90, format: 'text', minWidth: 200 },
  SUPPLIER_NAME: { label: 'Leverancier', order: 100, format: 'text' },
}

function columnLabel(key: string) { return COLUMN_CONFIG[key]?.label ?? key.replace(/_/g, ' ') }
function columnOrder(key: string) { return COLUMN_CONFIG[key]?.order ?? 1000 }
function isHidden(key: string) { return COLUMN_CONFIG[key]?.hidden ?? false }
function isSticky(key: string) { return COLUMN_CONFIG[key]?.sticky ?? false }
function columnMinWidth(key: string) { return COLUMN_CONFIG[key]?.minWidth }

function formatValue(key: string, value: any) {
  if (value === null || value === undefined) return ''
  const fmt = COLUMN_CONFIG[key]?.format ?? 'text'
  if (fmt === 'int') {
    const n = Number(String(value).replace(',', '.'))
    return Number.isFinite(n) ? String(Math.trunc(n)) : String(value)
  }
  if (fmt === 'money') {
    const n = Number(String(value).replace(',', '.'))
    if (!Number.isFinite(n)) return String(value)
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
  }
  return String(value)
}

function asSortable(v: any) {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  const n = Number(s.replace(',', '.'))
  if (!Number.isNaN(n) && s !== '') return n
  return s.toLowerCase()
}

function getDagdeel() {
  const h = new Date().getHours()
  if (h < 6) return 'Goedenacht'
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

function getDatum() {
  return new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function isFiets(p: any) {
  const g = String(p.GROUP_DESCRIPTION_1 ?? '').toLowerCase()
  if (p._source === 'vendit') {
    const heeftFiets = g.includes('fietsen') || g.includes('fiets')
    const isOnderdelen = g.includes('onderdelen')
    return heeftFiets && !isOnderdelen
  }
  return g.includes('fiets') || g.includes('bike') || g.includes('cycle') || g.includes('ebike') || g.includes('e-bike')
}

/** Zoek op meerdere woorden: elk woord moet ergens in het item voorkomen (zelfde logica als API) */
function matchesSearch(item: any, zoekterm: string): boolean {
  const words = zoekterm.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const allText = Object.values(item).map((v: any) => String(v ?? '').toLowerCase()).join(' ')
  return words.every(word => allText.includes(word))
}

type Product = { [key: string]: any }
type SortDir = 'asc' | 'desc'

const IconBox = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconChart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

const IconMap = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
)

const IconGrip = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="9" r="1.5" /><circle cx="15" cy="9" r="1.5" />
    <circle cx="9" cy="15" r="1.5" /><circle cx="15" cy="15" r="1.5" />
  </svg>
)

const IconStore = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

const IconPin = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

function WinkelKaartItem({ w, kleur, favoriet, onSelecteer, onToggleFavoriet }: {
  w: Winkel; kleur: string; favoriet: boolean
  onSelecteer: (w: Winkel) => void
  onToggleFavoriet: (id: number) => void
}) {
  return (
    <div className="wink-card cursor-pointer rounded-2xl overflow-hidden bg-white" style={{ boxShadow: '0 2px 12px rgba(13,31,78,0.07)', border: favoriet ? `1.5px solid ${DYNAMO_GOLD}` : '1px solid rgba(13,31,78,0.07)' }}>
      <div style={{ height: '4px', background: kleur }} />
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={isBikeTotaal(w.naam) ? { background: 'white', border: '1px solid rgba(13,31,78,0.1)' } : { background: kleur }} onClick={() => onSelecteer(w)}>
            {isBikeTotaal(w.naam) ? <img src={BIKE_TOTAAL_LOGO} alt="" className="w-full h-full object-contain p-1" /> : <span className="text-white text-sm font-bold">{w.naam.charAt(0)}</span>}
          </div>
          <div className="min-w-0 flex-1" onClick={() => onSelecteer(w)}>
            <div className="font-semibold text-sm truncate" style={{ color: DYNAMO_BLUE, fontFamily: F, letterSpacing: '-0.01em' }}>{w.naam}</div>
            <div className="flex items-center gap-2">
              <span style={{ color: 'rgba(13,31,78,0.35)', fontSize: '11px', fontFamily: F }}>#{w.dealer_nummer}</span>
              {w.land && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: w.land === 'Belgium' ? 'rgba(253,218,36,0.2)' : 'rgba(255,102,0,0.15)', color: w.land === 'Belgium' ? '#a16207' : '#c2410c', fontFamily: F }}>{w.land === 'Belgium' ? '🇧🇪' : '🇳🇱'}</span>
              )}
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavoriet(w.id) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:opacity-70 shrink-0"
            style={{ background: favoriet ? `${DYNAMO_GOLD}20` : 'rgba(13,31,78,0.04)', border: favoriet ? `1px solid ${DYNAMO_GOLD}60` : '1px solid rgba(13,31,78,0.08)' }}
            title={favoriet ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten'}
          >
            <span style={{ color: favoriet ? DYNAMO_GOLD : 'rgba(13,31,78,0.25)', fontSize: '14px', lineHeight: '1' }}>★</span>
          </button>
        </div>
        {(w.stad || w.postcode) ? (
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-4" style={{ background: 'rgba(13,31,78,0.04)' }} onClick={() => onSelecteer(w)}>
            <IconPin />
            <span style={{ color: 'rgba(13,31,78,0.5)', fontSize: '12px', fontFamily: F }}>{w.stad || ''}{w.stad && w.postcode ? ' · ' : ''}{w.postcode || ''}</span>
          </div>
        ) : <div className="mb-4" style={{ height: '32px' }} onClick={() => onSelecteer(w)} />}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(13,31,78,0.06)' }} onClick={() => onSelecteer(w)}>
          <span style={{ color: kleur, fontSize: '12px', fontWeight: 600, fontFamily: F }}>Bekijk voorraad</span>
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

function WinkelKaart({ winkels, onSelecteer, onGeocode, onGeocodeBelgium, isAdmin, geocodeLoading, geocodeResult, onDismissGeocodeResult }: {
  winkels: Winkel[]
  onSelecteer: (w: Winkel) => void
  onGeocode?: () => Promise<void>
  onGeocodeBelgium?: () => Promise<void>
  isAdmin?: boolean
  geocodeLoading?: boolean
  geocodeResult?: { bijgewerkt: number; totaal: number; mislukt: { id: number; naam: string; postcode?: string; straat?: string; stad?: string }[]; zonderAdres: { id: number; naam: string }[] } | null
  onDismissGeocodeResult?: () => void
}) {
  const [toonZonderLocatieLijst, setToonZonderLocatieLijst] = useState(false)
  const winkelsMetCoords = winkels.filter(w => w.lat && w.lng)
  const mapRef = useRef<any>(null)
  const mapIdRef = useRef(`winkel-kaart-${Date.now()}-${Math.random().toString(36).slice(2)}`)

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
        marker.bindPopup(`<div style="font-family:sans-serif;min-width:140px"><div style="font-weight:bold;color:${DYNAMO_BLUE};font-size:13px">${w.naam}</div><div style="color:#6b7280;font-size:11px;margin-top:2px">${w.stad || w.postcode || ''}</div><button onclick="window._selectWinkel(${w.id})" style="margin-top:8px;width:100%;background:${DYNAMO_BLUE};color:white;border:none;border-radius:6px;padding:6px;font-size:12px;cursor:pointer;font-weight:bold;">Bekijk voorraad →</button></div>`)
        bounds.push([w.lat!, w.lng!])
      })

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [60, 60] })
      ;(window as any)._selectWinkel = (id: number) => {
        const winkel = winkels.find(w => w.id === id)
        if (winkel) onSelecteer(winkel)
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
      <div className="flex flex-col justify-center" style={{ height: 380, background: 'rgba(13,31,78,0.03)', borderRadius: '16px', border: '1px dashed rgba(13,31,78,0.15)' }}>
        <div className="text-center p-6">
          <div className="flex justify-center mb-2" style={{ color: 'rgba(13,31,78,0.2)' }}><IconMap /></div>
          <p className="text-sm font-medium" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Geen kaart beschikbaar</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(13,31,78,0.3)', fontFamily: F }}>Voeg postcodes toe aan je winkels</p>
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
        <div className="rounded-xl p-3 text-xs" style={{ background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p style={{ color: DYNAMO_BLUE, fontWeight: 600 }}>{geocodeResult.bijgewerkt} van {geocodeResult.totaal} gegeocodeerd</p>
              {geocodeResult.zonderAdres.length > 0 && (
                <p style={{ color: 'rgba(13,31,78,0.5)', marginTop: 4 }}>{geocodeResult.zonderAdres.length} zonder adres (postcode of straat+stad ontbreekt)</p>
              )}
              {geocodeResult.mislukt.length > 0 && (
                <p style={{ color: '#b91c1c', marginTop: 4 }}>{geocodeResult.mislukt.length} mislukt (adres niet gevonden door Nominatim)</p>
              )}
            </div>
            <button onClick={onDismissGeocodeResult} className="shrink-0 rounded px-2 py-0.5 hover:bg-black/5" style={{ color: 'rgba(13,31,78,0.5)' }}>×</button>
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
              <button onClick={() => setToonZonderLocatieLijst(v => !v)} className="text-xs hover:underline text-left" style={{ color: 'rgba(13,31,78,0.5)', fontFamily: F }}>
                {zonderCoords.length} winkel{zonderCoords.length !== 1 ? 's' : ''} zonder locatie {toonZonderLocatieLijst ? '▼' : '▶'}
              </button>
              <button onClick={onGeocode} disabled={geocodeLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'rgba(13,31,78,0.06)', color: DYNAMO_BLUE, fontFamily: F }}>
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
        <div className="rounded-xl p-3 max-h-48 overflow-y-auto text-xs" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.08)', fontFamily: F }}>
          <p className="font-semibold mb-2" style={{ color: 'rgba(13,31,78,0.6)' }}>Winkels zonder locatie</p>
          <p className="mb-2" style={{ color: 'rgba(13,31,78,0.45)' }}>Alleen winkels met postcode of straat+stad worden gegeocodeerd. <Link href="/dashboard/beheer?locatie=zonder" className="font-semibold underline" style={{ color: DYNAMO_BLUE }}>Bewerk in Beheer</Link></p>
          <ul className="space-y-1">
            {zonderCoords.map(w => {
              const heeftAdres = !!(w.postcode?.trim() || (w.straat?.trim() && w.stad?.trim()))
              return (
                <li key={w.id} className="flex justify-between gap-2">
                  <span style={{ color: DYNAMO_BLUE }}>{w.naam}</span>
                  <span style={{ color: heeftAdres ? 'rgba(13,31,78,0.4)' : '#b91c1c' }}>
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

export default function Dashboard() {
  const { data: winkelsData = [], isLoading: winkelsLoading, mutate: mutateWinkels } = useSWR<Winkel[]>('/api/winkels', fetcher, { revalidateOnFocus: true })
  const winkels = Array.isArray(winkelsData) ? winkelsData : []
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)
  const [producten, setProducten] = useState<Product[]>([])
  const [kolommen, setKolommen] = useState<string[]>([])
  const [zichtbareKolommen, setZichtbareKolommen] = useState<string[]>([])
  const [kolommenGeladen, setKolommenGeladen] = useState(false)
  const [zoekterm, setZoekterm] = useState('')
  const [zoekKolom, setZoekKolom] = useState<string>('ALL')
  const [loading, setLoading] = useState(false)
  const [kolomPanelOpen, setKolomPanelOpen] = useState(false)
  const winkelSelectRef = useRef<WinkelSelectRef>(null)
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [gebruiker, setGebruiker] = useState('')
  const [authRequired, setAuthRequired] = useState<null | { message: string }>(null)
  const [vorigeStats, setVorigeStats] = useState<{ producten: number; voorraad: number } | null>(null)
  const { data: favorietenData, mutate: mutateFavorieten } = useSWR<{ winkel_ids: number[] }>('/api/favorieten', fetcher)
  const favorieten = Array.isArray(favorietenData?.winkel_ids) ? favorietenData.winkel_ids : []
  const [winkelModalOpen, setWinkelModalOpen] = useState(false)
  const { data: sessionData } = useSWR<{ isAdmin?: boolean; lunchModuleEnabled?: boolean }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const lunchModuleEnabled = sessionData?.lunchModuleEnabled === true

  const { data: profileData, mutate: mutateProfile } = useSWR<{ modules_order?: string[] }>('/api/profile', fetcher)
  const savedOrder = profileData?.modules_order
  const [moduleOrder, setModuleOrder] = useState<ModuleId[]>(() => [...DEFAULT_MODULE_ORDER])
  useEffect(() => {
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return
    const valid = savedOrder.filter((id): id is ModuleId => DEFAULT_MODULE_ORDER.includes(id as ModuleId))
    const missing = DEFAULT_MODULE_ORDER.filter(id => !valid.includes(id))
    const next = valid.length ? [...valid, ...missing] : [...DEFAULT_MODULE_ORDER]
    setModuleOrder(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [savedOrder])
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState<{ bijgewerkt: number; totaal: number; mislukt: { id: number; naam: string; postcode?: string; straat?: string; stad?: string }[]; zonderAdres: { id: number; naam: string }[] } | null>(null)
  const [kaartFilterLand, setKaartFilterLand] = useState<'alle' | 'Netherlands' | 'Belgium'>('alle')
  const [kaartFilterKassaPakket, setKaartFilterKassaPakket] = useState<'alle' | 'cyclesoftware' | 'wilmar' | 'vendit'>('alle')
  const [kaartFilterBikeTotaal, setKaartFilterBikeTotaal] = useState<'alle' | 'ja' | 'nee'>('alle')

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const winkelsGefilterd = useMemo(() => {
    return winkels.filter(w => {
      if (kaartFilterLand !== 'alle') {
        if (w.land !== kaartFilterLand) return false
      }
      if (kaartFilterKassaPakket !== 'alle') {
        const at = w.api_type ?? (w.wilmar_organisation_id && w.wilmar_branch_id ? 'wilmar' : 'cyclesoftware')
        if (kaartFilterKassaPakket === 'vendit') {
          if (at !== 'vendit' && at !== 'vendit_api') return false
        } else if (at !== kaartFilterKassaPakket) {
          return false
        }
      }
      if (kaartFilterBikeTotaal !== 'alle') {
        const bt = isBikeTotaal(w.naam)
        if (kaartFilterBikeTotaal === 'ja' && !bt) return false
        if (kaartFilterBikeTotaal === 'nee' && bt) return false
      }
      return true
    })
  }, [winkels, kaartFilterLand, kaartFilterKassaPakket, kaartFilterBikeTotaal])


  // Herstel geselecteerde winkel alleen uit URL (?winkel=); zonder param toon startpagina
  useEffect(() => {
    if (winkels.length === 0) return
    const idParam = searchParams.get('winkel')
    if (!idParam) {
      setGeselecteerdeWinkel(null)
      return
    }
    const id = Number(idParam)
    const w = id ? winkels.find(x => x.id === id) : null
    if (w) setGeselecteerdeWinkel(w)
  }, [winkels, searchParams])

  useEffect(() => {
    try {
      const opgeslagen = localStorage.getItem(KOLOMMEN_STORAGE_KEY)
      if (opgeslagen) {
        const parsed = JSON.parse(opgeslagen)
        if (Array.isArray(parsed) && parsed.length > 0) setZichtbareKolommen(parsed)
      }
    } catch {}
    setKolommenGeladen(true)

  }, [])

  useEffect(() => {
    if (!kolommenGeladen || zichtbareKolommen.length === 0) return
    try { localStorage.setItem(KOLOMMEN_STORAGE_KEY, JSON.stringify(zichtbareKolommen)) } catch {}
  }, [zichtbareKolommen, kolommenGeladen])

  const haalWinkelsOp = useCallback(() => mutateWinkels(), [mutateWinkels])
  const kolomPanelRef = useRef<HTMLDivElement>(null)
  const kolomTriggerRef = useRef<HTMLButtonElement>(null)

  function openWinkelSelect() {
    setWinkelModalOpen(true)
  }

  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (kolomPanelOpen && kolomPanelRef.current) {
      wasOpenRef.current = true
      const first = kolomPanelRef.current.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      first?.focus()
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      kolomTriggerRef.current?.focus()
    }
  }, [kolomPanelOpen])

  const haalVoorraadOp = useCallback(async (winkelId: number, dealer: string) => {
    setLoading(true)
    setAuthRequired(null)
    const params = new URLSearchParams()
    if (winkelId) params.set('winkel', String(winkelId))
    if (dealer) params.set('dealer', dealer)

    const res = await fetch(`/api/voorraad?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setProducten([]); setKolommen([])
      setAuthRequired({ message: data?.message ?? 'Voorraad ophalen mislukt.' })
      setLoading(false)
      return
    }
    const items = Array.isArray(data) ? data : data.products ?? []
    setProducten(items)
    const keys = items.length > 0 ? Object.keys(items[0]) : []
    const dynamicCols = keys.filter(k => !isHidden(k)).sort((a, b) => {
      const oa = columnOrder(a), ob = columnOrder(b)
      return oa !== ob ? oa - ob : a.localeCompare(b)
    })
    setKolommen(dynamicCols)
    setZichtbareKolommen(prev => {
      const opgeslagen = (() => {
        try { const s = localStorage.getItem(KOLOMMEN_STORAGE_KEY); return s ? JSON.parse(s) : null } catch { return null }
      })()
      if (opgeslagen && Array.isArray(opgeslagen) && opgeslagen.length > 0) {
        const allowed = new Set(dynamicCols)
        const kept = opgeslagen.filter((k: string) => allowed.has(k))
        if (kept.length > 0) return kept
      }
      if (prev.length > 0) {
        const allowed = new Set(dynamicCols)
        const kept = prev.filter(k => allowed.has(k))
        if (kept.length > 0) return kept
      }
      return dynamicCols
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const email = data.user?.email ?? ''
      let displayNaam = email
      if (data.user?.id) {
        const { data: rol } = await supabase.from('gebruiker_rollen').select('naam').eq('user_id', data.user.id).single()
        if (rol?.naam?.trim()) displayNaam = rol.naam.trim()
      }
      setGebruiker(displayNaam)
    })
  }, [])

  useEffect(() => {
    if (!geselecteerdeWinkel) return
    haalVoorraadOp(geselecteerdeWinkel.id, geselecteerdeWinkel.dealer_nummer)
  }, [geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    try { localStorage.setItem(WINKEL_STORAGE_KEY, String(winkel.id)) } catch {}
    if (winkel.api_type === 'vendit') mutateWinkels()
    setVorigeStats(producten.length > 0 ? {
      producten: producten.length,
      voorraad: producten.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    } : null)
    setGeselecteerdeWinkel(winkel)
    setZoekterm(''); setProducten([]); setKolommen([])
    setSortKey(''); setZoekKolom('ALL'); setKolomPanelOpen(false); setAuthRequired(null)
    await haalVoorraadOp(winkel.id, winkel.dealer_nummer)
  }

  async function uitloggen() { await supabase.auth.signOut(); router.push('/login') }


  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  function toggleKolom(k: string) {
    setZichtbareKolommen(prev => {
      if (prev.includes(k)) { if (prev.length === 1) return prev; return prev.filter(x => x !== k) }
      const set = new Set([...prev, k])
      return kolommen.filter(x => set.has(x))
    })
  }

  async function haalLocatiesOp() {
    setGeocodeLoading(true)
    setGeocodeResult(null)
    try {
      const res = await fetch('/api/winkels/geocode', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (data.bijgewerkt != null) await mutateWinkels()
        setGeocodeResult({ bijgewerkt: data.bijgewerkt ?? 0, totaal: data.totaal ?? 0, mislukt: data.mislukt ?? [], zonderAdres: data.zonderAdres ?? [] })
      }
    } finally {
      setGeocodeLoading(false)
    }
  }

  async function haalBelgieLocatiesOp() {
    setGeocodeLoading(true)
    setGeocodeResult(null)
    try {
      const res = await fetch('/api/winkels/geocode?force_belgium=1', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (data.bijgewerkt != null) await mutateWinkels()
        setGeocodeResult({ bijgewerkt: data.bijgewerkt ?? 0, totaal: data.totaal ?? 0, mislukt: data.mislukt ?? [], zonderAdres: data.zonderAdres ?? [] })
      }
    } finally {
      setGeocodeLoading(false)
    }
  }

  async function toggleFavoriet(id: number) {
    const res = await fetch('/api/favorieten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winkel_id: id }),
    })
    if (res.ok) await mutateFavorieten()
  }

  const orderedModules = useMemo(() => {
    const available: ModuleId[] = ['voorraad', ...(lunchModuleEnabled ? ['lunch' as ModuleId] : []), 'brand-groep', 'meer']
    const byOrder = new Map(moduleOrder.map((id, i) => [id, i]))
    return [...available].sort((a, b) => (byOrder.get(a) ?? 999) - (byOrder.get(b) ?? 999))
  }, [moduleOrder, lunchModuleEnabled])

  async function moveModule(fromIndex: number, toIndex: number) {
    const arr = [...orderedModules]
    const [dragged] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, dragged)
    const next = [...arr, ...moduleOrder.filter(id => !orderedModules.includes(id))]
    setModuleOrder(next)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules_order: next }),
      })
      if (res.ok) mutateProfile()
    } catch {
      // fallback: volgorde lokaal behouden, volgende keer opnieuw proberen
    }
  }

  const stickyKey = kolommen.find(isSticky)
  const stickyEnabled = !!stickyKey && zichtbareKolommen.includes(stickyKey)
  const dealer = geselecteerdeWinkel?.dealer_nummer ?? ''
  const venditLaatstDatum = geselecteerdeWinkel ? (winkels.find(w => w.id === geselecteerdeWinkel!.id)?.vendit_laatst_datum ?? geselecteerdeWinkel.vendit_laatst_datum) : null
  const bron =
    geselecteerdeWinkel?.api_type ??
    (geselecteerdeWinkel?.wilmar_branch_id && geselecteerdeWinkel?.wilmar_organisation_id
      ? 'wilmar'
      : 'cyclesoftware')

  const gefilterdEnGesorteerd = useMemo(() => {
    let arr = producten.filter(p => (Number(p?.STOCK) || 0) >= 1)
    if (zoekterm.trim() !== '') {
      if (zoekKolom === 'ALL') {
        arr = arr.filter(p => matchesSearch(p, zoekterm))
      } else {
        const needle = zoekterm.toLowerCase()
        arr = arr.filter(p => String(p[zoekKolom] ?? '').toLowerCase().includes(needle))
      }
    }
    if (sortKey) {
      arr.sort((a, b) => {
        const av = asSortable(a[sortKey]), bv = asSortable(b[sortKey])
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return arr
  }, [producten, zoekKolom, zoekterm, sortKey, sortDir])

  const stats = useMemo(() => ({
    producten: gefilterdEnGesorteerd.length,
    voorraad: gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    fietsen: gefilterdEnGesorteerd.filter(p => isFiets(p) && (Number(p.STOCK) || 0) > 0).reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    merken: new Set(gefilterdEnGesorteerd.map(p => p.BRAND_NAME)).size,
  }), [gefilterdEnGesorteerd])

  function trendPijl(huidig: number, vorig: number | undefined) {
    if (vorig === undefined || vorig === null) return null
    if (huidig > vorig) return <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 700, marginLeft: '2px' }}>↑</span>
    if (huidig < vorig) return <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700, marginLeft: '2px' }}>↓</span>
    return <span style={{ color: 'rgba(13,31,78,0.3)', fontSize: '12px', marginLeft: '2px' }}>→</span>
  }

  const inputStyle = { background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = "rounded-xl px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb', fontFamily: F }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        .s1{animation:fadeUp .5s ease forwards;opacity:0}
        .s2{animation:fadeUp .5s .08s ease forwards;opacity:0}
        .s3{animation:fadeUp .5s .16s ease forwards;opacity:0}
        .s4{animation:fadeUp .5s .24s ease forwards;opacity:0}
        .mod-card{transition:transform .2s ease,box-shadow .2s ease}
        .mod-card:hover{transform:translateY(-3px);box-shadow:0 16px 48px rgba(13,31,78,.18)!important}
        .wink-card{transition:transform .2s ease,box-shadow .2s ease}
        .wink-card:hover{transform:translateY(-3px);box-shadow:0 12px 36px rgba(13,31,78,.14)!important}
      `}</style>

      {/* NAVIGATIE */}
      <header style={{ background: DYNAMO_BLUE, fontFamily: F }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-stretch gap-2 sm:gap-0 py-2 sm:py-0" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <Link href="/dashboard" onClick={(e) => { e.preventDefault(); try { localStorage.removeItem(WINKEL_STORAGE_KEY) } catch {}; setGeselecteerdeWinkel(null); router.push('/dashboard') }} className="flex items-center gap-2 sm:gap-3 pr-3 sm:pr-6 shrink-0 hover:opacity-90 transition" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-black shrink-0" style={{ background: DYNAMO_GOLD }}>
              <span style={{ color: DYNAMO_BLUE, fontFamily: F, fontWeight: 800, fontSize: '13px' }} className="sm:text-[15px]">D</span>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs sm:text-sm text-white leading-tight truncate" style={{ letterSpacing: '0.06em', fontFamily: F }}>DYNAMO</div>
              <div className="text-[10px] sm:text-xs font-semibold leading-tight truncate" style={{ color: DYNAMO_GOLD, letterSpacing: '0.12em', fontFamily: F }}>RETAIL GROUP</div>
            </div>
          </Link>
          <div className="flex items-center px-3 sm:px-5 gap-2 flex-1 min-w-0" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs font-semibold uppercase hidden sm:block shrink-0" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', fontFamily: F }}>Winkel</span>
            <WinkelSelect
              ref={winkelSelectRef}
              winkels={winkels}
              value={geselecteerdeWinkel}
              onChange={w => selecteerWinkel(w)}
              placeholder="Kies winkel..."
              id="winkel-select"
              aria-label="Selecteer winkel"
              className="min-w-0 flex-1 max-w-[180px] sm:min-w-[140px]"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }}
            />
          </div>
          <div className="flex items-center gap-2 pl-2 sm:pl-4 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
            <span className="text-xs hidden md:block px-2 truncate max-w-[120px]" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: F }}>{gebruiker}</span>
            <Link href="/dashboard/beheer" className="rounded-lg p-2 sm:px-3 sm:py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }} title="Beheer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="hidden sm:inline">Beheer</span>
            </Link>
            <Link href="/dashboard/instellingen" className="rounded-lg p-2 sm:px-3 sm:py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }} title="Instellingen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span className="hidden sm:inline">Instellingen</span>
            </Link>
            <button onClick={uitloggen} aria-label="Uitloggen" className="rounded-lg px-3 sm:px-4 py-1.5 text-xs font-bold transition hover:opacity-90 shrink-0" style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE, fontFamily: F }}>
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <WinkelModal
        open={winkelModalOpen}
        onClose={() => setWinkelModalOpen(false)}
        winkels={winkels}
        onSelect={selecteerWinkel}
        loading={winkelModalOpen && winkelsLoading}
      />

      <main className="flex-1 min-w-0 p-3 sm:p-5 pb-6 sm:pb-5 space-y-4 sm:space-y-6 overflow-auto">
          {!geselecteerdeWinkel ? (
            <div className="space-y-8">

              {/* HERO */}
              <div className="s1 relative rounded-xl overflow-hidden" style={{ background: DYNAMO_BLUE, minHeight: 140 }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 75% 30%, rgba(240,192,64,0.12) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.04) 0%, transparent 40%)' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: DYNAMO_GOLD }} />
                <div className="hidden sm:block" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '200px', background: 'rgba(255,255,255,0.025)', borderLeft: '1px solid rgba(255,255,255,0.06)' }} />
                <div className="relative p-4 sm:p-5 sm:pr-52 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)' }}>
                      <span className="w-1 h-1 rounded-full" style={{ background: DYNAMO_GOLD }} />
                      <span className="text-[10px] font-semibold tracking-wider" style={{ color: DYNAMO_GOLD, fontFamily: F }}><span className="uppercase">{getDagdeel()}</span>{gebruiker ? `, ${gebruiker}` : ''}</span>
                    </div>
                    <h1 style={{ fontFamily: F, color: 'white', fontSize: 'clamp(20px, 2.8vw, 28px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2 }}>Voorraad Dashboard</h1>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', fontFamily: F }}>{getDatum()}</p>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={openWinkelSelect}
                      aria-label="Kies een winkel"
                      className="flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-sm transition-all hover:opacity-90"
                      style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE, fontFamily: F, boxShadow: '0 2px 12px rgba(240,192,64,0.3)' }}
                    >
                      <IconStore /> Kies een winkel
                    </button>
                    <Link href="/dashboard/brand-groep" className="flex items-center gap-2 rounded-lg px-4 py-2 font-semibold text-sm transition-all hover:opacity-80" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.12)', fontFamily: F }}>
                      <IconChart /> Analyse
                    </Link>
                  </div>
                  {winkels.length > 0 && (
                    <div className="flex items-center gap-4 sm:gap-5 pt-2 border-t border-white/10 w-full sm:w-auto">
                      {[{ label: 'Winkels', value: winkels.length, color: 'white' }, { label: 'Locaties', value: winkels.filter(w => w.stad).length, color: 'white' }, { label: 'Favorieten', value: favorieten.length, color: DYNAMO_GOLD }].map((s, i) => (
                        <div key={s.label} className="flex items-center gap-2">
                          {i > 0 && <div className="hidden sm:block w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} />}
                          <div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                            <div style={{ color: s.color, fontSize: '16px', fontWeight: 700, fontFamily: F, lineHeight: 1.2 }}>{s.value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* MODULES */}
              <div className="s2">
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Modules</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Sleep om te herschikken</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {orderedModules.map((id, idx) => {
                    const modCard = 'mod-card rounded-2xl overflow-hidden'
                    const isBlue = id === 'voorraad'
                    const dragHandle = (
                      <div
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }}
                        onDragOver={e => e.preventDefault()}
                        onClick={e => { e.preventDefault(); e.stopPropagation() }}
                        className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing opacity-50 hover:opacity-90 transition-opacity"
                        style={isBlue ? { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' } : { background: 'rgba(13,31,78,0.08)', color: 'rgba(13,31,78,0.5)' }}
                        title="Sleep om volgorde te wijzigen"
                      >
                        <IconGrip />
                      </div>
                    )
                    if (id === 'voorraad') {
                      return (
                        <div key={id} className="relative" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div className={`${modCard} cursor-pointer`} style={{ background: DYNAMO_BLUE, boxShadow: '0 4px 24px rgba(13,31,78,0.2)' }} onClick={openWinkelSelect}>
                            {dragHandle}
                            <div className="p-6">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(240,192,64,0.15)' }}>
                                <div style={{ color: DYNAMO_GOLD }}><IconBox /></div>
                              </div>
                              <div style={{ fontFamily: F, color: 'white', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' }}>Voorraad</div>
                              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: F }}>Zoek en filter producten per winkel</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                              <span style={{ color: DYNAMO_GOLD, fontSize: '12px', fontWeight: 600, fontFamily: F }}>Selecteer winkel →</span>
                              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px', fontFamily: F }}>{winkels.length} locaties</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (id === 'lunch') {
                      return (
                        <div key={id} className="relative" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/lunch" className={`${modCard} block cursor-pointer`} style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 4px 24px rgba(13,31,78,0.1)' }}>
                            {dragHandle}
                            <div className="p-6">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: DYNAMO_BLUE }}>
                                <span style={{ color: DYNAMO_GOLD, fontSize: '20px' }}>🥪</span>
                              </div>
                              <div style={{ fontFamily: F, color: DYNAMO_BLUE, fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' }}>Lunch bestellen</div>
                              <div style={{ color: 'rgba(13,31,78,0.5)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: F }}>Bestel broodjes voor op kantoor</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(13,31,78,0.03)', borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                              <span style={{ color: DYNAMO_BLUE, fontSize: '12px', fontWeight: 600, fontFamily: F }}>Bestellen →</span>
                              <span style={{ color: DYNAMO_BLUE, opacity: 0.6, fontSize: '18px' }}>🥪</span>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'brand-groep') {
                      return (
                        <div key={id} className="relative" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/brand-groep" className={`${modCard} block cursor-pointer`} style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 4px 24px rgba(13,31,78,0.1)' }}>
                            {dragHandle}
                            <div className="p-6">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: DYNAMO_BLUE }}>
                                <div style={{ color: DYNAMO_GOLD }}><IconChart /></div>
                              </div>
                              <div style={{ fontFamily: F, color: DYNAMO_BLUE, fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' }}>Merk / Groep</div>
                              <div style={{ color: 'rgba(13,31,78,0.5)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: F }}>Voorraad per merk en productgroep</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(13,31,78,0.03)', borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                              <span style={{ color: DYNAMO_BLUE, fontSize: '12px', fontWeight: 600, fontFamily: F }}>Ga naar analyse →</span>
                              <div style={{ color: DYNAMO_BLUE, opacity: 0.4 }}><IconChart /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'meer') {
                      return (
                        <div key={id} className="relative" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
                            {dragHandle}
                            <div className="p-6">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(13,31,78,0.06)' }}>
                                <div style={{ color: 'rgba(13,31,78,0.25)' }}><IconMap /></div>
                              </div>
                              <div style={{ fontFamily: F, color: 'rgba(13,31,78,0.35)', fontSize: '18px', fontWeight: 600 }}>Meer modules</div>
                              <div style={{ color: 'rgba(13,31,78,0.25)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: F }}>Export, vergelijking, alerts</div>
                            </div>
                            <div className="px-6 py-3" style={{ background: 'rgba(13,31,78,0.02)', borderTop: '1px solid rgba(13,31,78,0.05)' }}>
                              <span style={{ color: 'rgba(13,31,78,0.25)', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Binnenkort beschikbaar</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </div>

              {/* KAART */}
              <div className="s3">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Locaties</span>
                  <div className="flex-1 min-w-0 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={kaartFilterLand} onChange={e => setKaartFilterLand(e.target.value as 'alle' | 'Netherlands' | 'Belgium')} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', color: 'rgba(13,31,78,0.8)', fontFamily: F }}>
                      <option value="alle">Alle landen</option>
                      <option value="Netherlands">Nederland</option>
                      <option value="Belgium">België</option>
                    </select>
                    <select value={kaartFilterKassaPakket} onChange={e => setKaartFilterKassaPakket(e.target.value as 'alle' | 'cyclesoftware' | 'wilmar' | 'vendit')} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', color: 'rgba(13,31,78,0.8)', fontFamily: F }}>
                      <option value="alle">Kassa pakket: alle</option>
                      <option value="cyclesoftware">CycleSoftware</option>
                      <option value="wilmar">Wilmar</option>
                      <option value="vendit">Vendit</option>
                    </select>
                    <select value={kaartFilterBikeTotaal} onChange={e => setKaartFilterBikeTotaal(e.target.value as 'alle' | 'ja' | 'nee')} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', color: 'rgba(13,31,78,0.8)', fontFamily: F }}>
                      <option value="alle">Bike Totaal: alle</option>
                      <option value="ja">Bike Totaal: ja</option>
                      <option value="nee">Bike Totaal: nee</option>
                    </select>
                  </div>
                  <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: F }}>{winkelsGefilterd.filter(w => w.lat && w.lng).length} van {winkelsGefilterd.length} op kaart</span>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(13,31,78,0.08)', border: '1px solid rgba(13,31,78,0.07)' }}>
                  <WinkelKaart winkels={winkelsGefilterd} onSelecteer={selecteerWinkel} onGeocode={haalLocatiesOp} onGeocodeBelgium={haalBelgieLocatiesOp} isAdmin={isAdmin} geocodeLoading={geocodeLoading} geocodeResult={geocodeResult} onDismissGeocodeResult={() => setGeocodeResult(null)} />
                </div>
              </div>

              {/* WINKELKAARTEN */}
              {winkelsGefilterd.length > 0 && (
                <div className="s4 space-y-6">

                  {/* Favorieten */}
                  {favorieten.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: DYNAMO_GOLD, fontFamily: F }}>★ Mijn winkels</span>
                        <div className="flex-1 h-px" style={{ background: `${DYNAMO_GOLD}40` }} />
                        <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: F }}>{winkelsGefilterd.filter(w => favorieten.includes(w.id)).length} favoriet{winkelsGefilterd.filter(w => favorieten.includes(w.id)).length !== 1 ? 'en' : ''}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {winkelsGefilterd.filter(w => favorieten.includes(w.id)).map(w => (
                          <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[winkelsGefilterd.indexOf(w) % WINKEL_KLEUREN.length]} favoriet={true} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alle winkels */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Alle winkels</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                      <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: F }}>{winkelsGefilterd.length} locaties</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {winkelsGefilterd.map((w, i) => (
                        <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]} favoriet={favorieten.includes(w.id)} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          ) : (
            <>
              {loading && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4" style={{ background: 'rgba(13,31,78,0.06)', border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
                  <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Voorraad laden...</span>
                </div>
              )}

              <button onClick={() => { try { localStorage.removeItem(WINKEL_STORAGE_KEY) } catch {}; setGeselecteerdeWinkel(null); router.push('/dashboard') }} className="flex items-center gap-2 text-sm font-semibold transition hover:opacity-70" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                <IconArrowLeft /> Terug naar startscherm
              </button>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: 'Producten', value: stats.producten, vorig: vorigeStats?.producten, color: DYNAMO_BLUE },
                  { label: 'Totaal voorraad', value: stats.voorraad, vorig: vorigeStats?.voorraad, color: DYNAMO_BLUE },
                  { label: 'Fietsen op voorraad', value: stats.fietsen, color: '#16a34a' },
                  { label: 'Merken', value: stats.merken, color: DYNAMO_BLUE },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl px-3 sm:px-5 py-3 sm:py-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                    <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.08em', fontFamily: F }}>{s.label}</div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl font-bold" style={{ color: s.color, fontFamily: F, letterSpacing: '-0.03em' }}>{loading ? '...' : s.value.toLocaleString('nl-NL')}</div>
                      {!loading && trendPijl(s.value, (s as any).vorig)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Zoekbalk */}
              <div className="rounded-2xl p-3 sm:p-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{geselecteerdeWinkel.naam}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.45)', fontFamily: F }}>#{dealer}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.45)', fontFamily: F }}>
                        {bron === 'wilmar' ? 'Wilmar' : (bron === 'vendit' || bron === 'vendit_api') ? 'Vendit' : 'CycleSoftware'}
                      </span>
                      {bron === 'vendit' && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.08)', color: 'rgba(13,31,78,0.7)', fontFamily: F }} title={venditLaatstDatum ? 'Laatste voorraadsync uit vendit_stock' : 'Geen datum beschikbaar: vendit_stock heeft geen data voor dit dealer_nummer of de timestamp-kolom is leeg'}>
                          {venditLaatstDatum ? (() => {
                            const d = new Date(venditLaatstDatum)
                            const dag = d.getUTCDate()
                            const maand = d.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'UTC' })
                            const uur = String(d.getUTCHours()).padStart(2, '0')
                            const min = String(d.getUTCMinutes()).padStart(2, '0')
                            return `Laatst ${dag} ${maand} ${uur}.${min}`
                          })() : '— Datum onbekend'}
                        </span>
                      )}
                      {geselecteerdeWinkel.stad && <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(13,31,78,0.4)' }}><IconPin />{geselecteerdeWinkel.stad}</span>}
                      {geselecteerdeWinkel.land && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: geselecteerdeWinkel.land === 'Belgium' ? 'rgba(253,218,36,0.2)' : 'rgba(255,102,0,0.15)', color: geselecteerdeWinkel.land === 'Belgium' ? '#a16207' : '#c2410c', fontFamily: F }}>{geselecteerdeWinkel.land === 'Belgium' ? 'België' : 'Nederland'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link href={geselecteerdeWinkel ? `/dashboard/brand-groep?winkel=${geselecteerdeWinkel.id}` : '/dashboard/brand-groep'} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-80 shrink-0" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.08)', fontFamily: F }}>
                        <IconChart /> Merk/Groep
                      </Link>
                      <span className="text-xs shrink-0" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>
                        {loading ? 'Laden...' : `${gefilterdEnGesorteerd.length} resultaten`}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(13,31,78,0.3)' }}>⌕</span>
                      <input type="text" placeholder="Zoek op product, merk, barcode..." value={zoekterm} onChange={e => setZoekterm(e.target.value)} className="w-full rounded-xl px-3 py-2 pl-9 text-sm" style={inputStyle} />
                    </div>
                    <select value={zoekKolom} onChange={e => setZoekKolom(e.target.value)} className="rounded-xl px-3 py-2 text-sm w-full sm:w-auto min-w-0" style={inputStyle}>
                      <option value="ALL">Alle kolommen</option>
                      {kolommen.map(k => <option key={k} value={k}>{columnLabel(k)}</option>)}
                    </select>
                    <div className="relative">
                      <button ref={kolomTriggerRef} onClick={() => setKolomPanelOpen(v => !v)} aria-expanded={kolomPanelOpen} aria-haspopup="dialog" aria-label="Kolommen kiezen" className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 flex items-center gap-2" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                        ⚙ Kolommen ({zichtbareKolommen.length})
                      </button>
                      {kolomPanelOpen && (
                        <div ref={kolomPanelRef} role="dialog" aria-label="Kolommen configuratie" className="absolute right-0 left-0 sm:left-auto mt-2 w-full sm:w-72 max-w-sm rounded-2xl bg-white shadow-xl p-4 z-20" style={{ border: '1px solid rgba(13,31,78,0.1)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Kolommen</span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none" aria-label="Sluiten">✕</button>
                          </div>
                          <p className="text-xs mb-3" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Voorkeur wordt automatisch onthouden.</p>
                          <div className="flex gap-2 mb-3">
                            <button onClick={() => setZichtbareKolommen([...kolommen])} className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:bg-gray-50" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Alles aan</button>
                            <button onClick={() => setZichtbareKolommen(prev => prev.length > 1 ? [prev[0]] : prev)} className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:bg-gray-50" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Alles uit</button>
                          </div>
                          <div className="space-y-1 max-h-64 overflow-auto">
                            {kolommen.map(k => (
                              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5">
                                <input type="checkbox" checked={zichtbareKolommen.includes(k)} onChange={() => toggleKolom(k)} disabled={zichtbareKolommen.includes(k) && zichtbareKolommen.length === 1} className="accent-blue-600" />
                                <span style={{ color: DYNAMO_BLUE, fontFamily: F }}>{columnLabel(k)}</span>
                                {isSticky(k) && <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Vast</span>}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {(zoekterm || zoekKolom !== 'ALL') && (
                      <button onClick={() => { setZoekterm(''); setZoekKolom('ALL') }} className="text-sm font-semibold transition hover:opacity-70" style={{ color: '#ef4444', fontFamily: F }}>✕ Wis filters</button>
                    )}
                  </div>
                </div>
              </div>

              {authRequired && (
                <div className="rounded-2xl p-4 text-sm" style={{ background: '#fffbeb', border: '1px solid rgba(240,192,64,0.4)' }}>
                  <p className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Toestemming vereist</p>
                  <p className="mt-1" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{authRequired.message}</p>
                </div>
              )}

              {/* Tabel */}
              <div className="rounded-2xl overflow-hidden -mx-3 sm:mx-0" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="overflow-x-auto overflow-y-visible" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm min-w-[600px] [border-collapse:separate] [border-spacing:0]">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        {zichtbareKolommen.map(k => {
                          const active = sortKey === k
                          const sticky = stickyEnabled && stickyKey === k
                          return (
                            <th key={k} scope="col" className="px-4 py-3 text-left" style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.7)', background: DYNAMO_BLUE, fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F, position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined, zIndex: sticky ? 60 : undefined, minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
                              <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:opacity-80 transition">
                                {columnLabel(k)}
                                <span style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.25)' }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                              </button>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 12 }).map((_, i) => (
                          <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                            {zichtbareKolommen.map(k => <td key={k} className="px-4 py-3"><div className="h-3 rounded" style={{ background: 'rgba(13,31,78,0.06)', width: '80px' }} /></td>)}
                          </tr>
                        ))
                      ) : gefilterdEnGesorteerd.length === 0 ? (
                        <tr>
                          <td colSpan={zichtbareKolommen.length} className="px-6 py-16 text-center">
                            <div className="text-3xl mb-3">🔍</div>
                            <div className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Geen producten gevonden</div>
                            <div className="text-sm mt-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Probeer een andere zoekterm</div>
                          </td>
                        </tr>
                      ) : (
                        gefilterdEnGesorteerd.map((p, i) => (
                          <tr key={i} className="transition hover:bg-blue-50/40" style={{ borderBottom: '1px solid rgba(13,31,78,0.05)', background: i % 2 === 1 ? 'rgba(13,31,78,0.015)' : 'white' }}>
                            {zichtbareKolommen.map(k => {
                              const sticky = stickyEnabled && stickyKey === k
                              const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                              const stockVal = Number(p[k])
                              return (
                                <td key={k} className="px-4 py-2.5 align-middle" style={{ ...(sticky ? { position: 'sticky', left: 0, background: 'white', zIndex: 40, boxShadow: '2px 0 0 0 rgba(13,31,78,0.06)' } : {}), minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
                                  <span className="text-sm" style={{ fontFamily: F, color: isStock ? (stockVal === 0 ? '#dc2626' : stockVal <= 3 ? '#d97706' : '#16a34a') : DYNAMO_BLUE, fontWeight: isStock ? 600 : 400, opacity: isStock ? 1 : 0.8 }}>
                                    {formatValue(k, p[k])}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {!loading && gefilterdEnGesorteerd.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(13,31,78,0.06)' }}>
                    <span className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{gefilterdEnGesorteerd.length} producten</span>
                    <span className="text-xs" style={{ color: 'rgba(13,31,78,0.3)', fontFamily: F }}>Klik op kolomheader om te sorteren</span>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
    </div>
  )
}