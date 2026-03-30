'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BrancheNieuwsModule, BRANCHE_NIEUWS_MEER_URL } from '@/components/BrancheNieuws'
import useSWR from 'swr'
import { WinkelModal } from '@/components/WinkelModal'
import { DYNAMO_BLUE, DYNAMO_GOLD, DYNAMO_LOGO, dashboardModuleTile, dashboardUi } from '@/lib/theme'
import type { Winkel } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const KOLOMMEN_STORAGE_KEY = 'dynamo_zichtbare_kolommen'
const WINKEL_STORAGE_KEY = 'dynamo_geselecteerde_winkel_id'
const F = "'Outfit', sans-serif"

const DEFAULT_MODULE_ORDER = ['voorraad', 'lunch', 'brand-groep', 'campagne-fietsen', 'branche-nieuws', 'meer'] as const
type ModuleId = (typeof DEFAULT_MODULE_ORDER)[number]

const WINKEL_KLEUREN = [
  '#2D457C', '#16a34a', '#dc2626', '#9333ea',
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

const IconLunch = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3v0h3" />
  </svg>
)

const IconBike = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
  </svg>
)

const IconNewspaper = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18a2 2 0 0 1-2 2z" />
    <path d="M18 10h-4" /><path d="M18 14h-4" /><path d="M18 6h-4" />
    <path d="M6 10h.01" /><path d="M6 14h.01" />
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
              <span style={{ color: 'rgba(45,69,124,0.35)', fontSize: '11px', fontFamily: F }}>#{w.dealer_nummer}</span>
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
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [gebruiker, setGebruiker] = useState('')
  const [authRequired, setAuthRequired] = useState<null | { message: string }>(null)
  const [vorigeStats, setVorigeStats] = useState<{ producten: number; voorraad: number } | null>(null)
  const { data: favorietenData, mutate: mutateFavorieten } = useSWR<{ winkel_ids: number[] }>('/api/favorieten', fetcher)
  const favorieten = Array.isArray(favorietenData?.winkel_ids) ? favorietenData.winkel_ids : []
  const [winkelModalOpen, setWinkelModalOpen] = useState(false)
  const { data: sessionData } = useSWR<{
    isAdmin?: boolean
    lunchOnly?: boolean
    dashboardModules?: string[]
    allowedCountries?: ('Netherlands' | 'Belgium')[] | null
  }>('/api/auth/session-info', fetcher)
  const { data: newsUnreadData } = useSWR<{ count: number }>('/api/news/unread', fetcher, {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  })
  const isAdmin = sessionData?.isAdmin === true
  const lunchOnly = sessionData?.lunchOnly === true
  const allowedCountries = sessionData?.allowedCountries ?? null

  const winkelsVoorGebruiker = useMemo(() => {
    if (!allowedCountries || allowedCountries.length === 0) return winkels
    return winkels.filter(w => {
      if (!w.land) return true
      return allowedCountries.includes(w.land)
    })
  }, [winkels, allowedCountries])

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
  const [winkelQuickZoek, setWinkelQuickZoek] = useState('')
  const [temperatuur, setTemperatuur] = useState<number | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const winkelsGefilterd = useMemo(() => {
    return winkelsVoorGebruiker.filter(w => {
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
  }, [winkelsVoorGebruiker, kaartFilterLand, kaartFilterKassaPakket, kaartFilterBikeTotaal])

  const winkelsQuickPick = useMemo(() => {
    const q = winkelQuickZoek.trim().toLowerCase()
    if (!q) return [] as Winkel[]
    return winkelsVoorGebruiker.filter(w => {
      const blob = [w.naam, w.stad, w.postcode, w.straat].map(s => String(s ?? '').toLowerCase()).join(' ')
      return blob.includes(q)
    }).slice(0, 8)
  }, [winkelQuickZoek, winkelsVoorGebruiker])

  const kaartFiltersActief = kaartFilterLand !== 'alle' || kaartFilterKassaPakket !== 'alle' || kaartFilterBikeTotaal !== 'alle'
  const showKaartFilterEmpty = !winkelsLoading && winkelsVoorGebruiker.length > 0 && winkelsGefilterd.length === 0

  function resetKaartFilters() {
    setKaartFilterLand('alle')
    setKaartFilterKassaPakket('alle')
    setKaartFilterBikeTotaal('alle')
  }

  // Herstel geselecteerde winkel alleen uit URL (?winkel=); zonder param toon startpagina
  useEffect(() => {
    if (winkelsVoorGebruiker.length === 0) return
    if (sessionData === undefined) return
    if (lunchOnly) {
      if (searchParams.get('winkel')) router.replace('/dashboard')
      setGeselecteerdeWinkel(null)
      return
    }
    const idParam = searchParams.get('winkel')
    if (!idParam) {
      setGeselecteerdeWinkel(null)
      return
    }
    const id = Number(idParam)
    const w = id ? winkelsVoorGebruiker.find(x => x.id === id) : null
    if (w) setGeselecteerdeWinkel(w)
  }, [winkelsVoorGebruiker, searchParams, lunchOnly, router, sessionData])

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

  // Temperatuur ophalen voor geselecteerde locatie (Open-Meteo, gratis, geen API key)
  useEffect(() => {
    const w = geselecteerdeWinkel
    if (!w?.lat || !w?.lng) {
      setTemperatuur(null)
      return
    }
    let cancelled = false
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lng}&current=temperature_2m`)
      .then(r => r.json())
      .then((data: { current?: { temperature_2m?: number } }) => {
        if (!cancelled && typeof data?.current?.temperature_2m === 'number') setTemperatuur(data.current.temperature_2m)
      })
      .catch(() => { if (!cancelled) setTemperatuur(null) })
    return () => { cancelled = true }
  }, [geselecteerdeWinkel?.id, geselecteerdeWinkel?.lat, geselecteerdeWinkel?.lng])

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
    if (sessionData === undefined) {
      return [...DEFAULT_MODULE_ORDER]
    }
    const fromSession = sessionData.dashboardModules ?? []
    const valid = fromSession.filter((id): id is ModuleId => DEFAULT_MODULE_ORDER.includes(id as ModuleId))
    if (valid.length === 0) return []
    const byOrder = new Map(moduleOrder.map((id, i) => [id, i]))
    return [...valid].sort((a, b) => (byOrder.get(a) ?? 999) - (byOrder.get(b) ?? 999))
  }, [moduleOrder, sessionData])

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
  const venditLaatstDatum = geselecteerdeWinkel ? (winkelsVoorGebruiker.find(w => w.id === geselecteerdeWinkel!.id)?.vendit_laatst_datum ?? geselecteerdeWinkel.vendit_laatst_datum) : null
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
    return <span style={{ color: 'rgba(45,69,124,0.3)', fontSize: '12px', marginLeft: '2px' }}>→</span>
  }

  const inputStyle = { background: 'rgba(45,69,124,0.05)', border: `1px solid ${dashboardUi.borderSoft}`, color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = "rounded-xl px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        .s1{animation:fadeUp .5s ease forwards;opacity:0}
        .s2{animation:fadeUp .5s .08s ease forwards;opacity:0}
        .s3{animation:fadeUp .5s .16s ease forwards;opacity:0}
        .mod-card{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
        .mod-card:hover{transform:translateY(-2px);box-shadow:0 16px 44px rgba(0,0,0,.22)!important}
        .mod-card:focus-visible{outline:2px solid rgba(255,255,255,.45);outline-offset:3px}
        .wink-card{transition:transform .2s ease,box-shadow .2s ease}
        .wink-card:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(45,69,124,.12)!important}
      `}</style>

      {/* NAVIGATIE */}
      <header style={{ background: DYNAMO_BLUE, fontFamily: F }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-stretch gap-2 sm:gap-0 py-2 sm:py-0" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <Link href="/dashboard" onClick={(e) => { e.preventDefault(); try { localStorage.removeItem(WINKEL_STORAGE_KEY) } catch {}; setGeselecteerdeWinkel(null); router.push('/dashboard') }} className="flex items-center gap-2 sm:gap-3 pr-3 sm:pr-6 shrink-0 hover:opacity-90 transition" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <img src={DYNAMO_LOGO} alt="Dynamo Retail Group" className="h-7 sm:h-8 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-2 pl-2 sm:pl-4 shrink-0 w-full sm:w-auto justify-end sm:justify-start ml-auto">
            <span className="text-xs hidden md:block px-2 truncate max-w-[120px]" style={{ color: 'white', fontFamily: F }}>{gebruiker}</span>
            <Link
              href="/dashboard/nieuws"
              className="rounded-lg p-2 sm:px-3 sm:py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5 relative"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }}
              title="Intern nieuws"
            >
              <span className="hidden sm:inline">Nieuws</span>
              <span className="sm:hidden">📰</span>
              {(newsUnreadData?.count ?? 0) > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                  style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}
                  aria-label={`${newsUnreadData?.count} ongelezen`}
                >
                  {(newsUnreadData?.count ?? 0) > 99 ? '99+' : newsUnreadData?.count ?? 0}
                </span>
              )}
            </Link>
            <Link href="/dashboard/beheer" className="rounded-lg p-2 sm:px-3 sm:py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }} title="Beheer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="hidden sm:inline">Beheer</span>
            </Link>
            <Link href="/dashboard/instellingen" className="rounded-lg p-2 sm:px-3 sm:py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }} title="Instellingen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span className="hidden sm:inline">Instellingen</span>
            </Link>
            <button onClick={uitloggen} aria-label="Uitloggen" className="rounded-lg px-3 sm:px-4 py-1.5 text-xs font-bold transition hover:opacity-90 shrink-0" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', fontFamily: F }}>
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <WinkelModal
        open={winkelModalOpen}
        onClose={() => setWinkelModalOpen(false)}
        winkels={winkelsVoorGebruiker}
        onSelect={selecteerWinkel}
        loading={winkelModalOpen && winkelsLoading}
      />

      <main className="flex-1 min-w-0 p-3 sm:p-5 pb-6 sm:pb-5 space-y-4 sm:space-y-6 overflow-auto">
          {!geselecteerdeWinkel ? (
            <div className="space-y-8">

              {/* HERO — één duidelijke binnenkomst: welkom + context + (optioneel) kerngetallen */}
              <section className="s1 relative rounded-xl overflow-hidden shadow-lg shadow-[rgba(45,69,124,0.12)] ring-1 ring-white/10" style={{ background: DYNAMO_BLUE, minHeight: 140 }} aria-labelledby="dashboard-heading-welcome">
                <div className="pointer-events-none absolute top-0 left-0 right-0 h-[3px] opacity-95" style={{ background: `linear-gradient(90deg, transparent 0%, ${DYNAMO_GOLD} 45%, ${DYNAMO_GOLD} 55%, transparent 100%)` }} aria-hidden />
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 75% 30%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.04) 0%, transparent 40%)' }} aria-hidden />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.2)' }} aria-hidden />
                <div className="relative p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                    <div className="min-w-0 flex flex-col gap-2 sm:gap-3">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}>
                          <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'white' }} aria-hidden />
                          <span className="text-[10px] font-semibold tracking-wider" style={{ color: 'rgba(255,255,255,0.95)', fontFamily: F }}><span className="uppercase">{getDagdeel()}</span>{gebruiker ? `, ${gebruiker}` : ''}</span>
                        </div>
                        <h1 id="dashboard-heading-welcome" className="min-w-0" style={{ fontFamily: F, color: 'white', fontSize: 'clamp(20px, 2.8vw, 28px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2 }}>DRG Portal</h1>
                      </div>
                      <p className="text-balance" style={{ color: 'rgba(255,255,255,0.92)', fontSize: '12px', fontFamily: F }}>{getDatum()}</p>
                      {!lunchOnly && !winkelsLoading && winkelsVoorGebruiker.length === 0 && (
                        <p className="max-w-xl rounded-lg px-3 py-2 text-xs leading-snug" style={{ background: 'rgba(0,0,0,0.2)', color: 'rgba(255,255,255,0.95)', fontFamily: F }}>
                          Er zijn nog geen winkels gekoppeld aan jouw account of land-rechten.
                          {isAdmin ? (
                            <> <Link href="/dashboard/beheer" className="font-semibold underline underline-offset-2">Open Beheer</Link> om winkels te koppelen.</>
                          ) : (
                            ' Neem contact op met een beheerder.'
                          )}
                        </p>
                      )}
                    </div>
                    {!lunchOnly && (
                      <div
                        className="flex flex-wrap items-center gap-4 sm:gap-5 shrink-0 pt-1 border-t border-white/10 lg:border-t-0 lg:pt-0 lg:pl-6 lg:border-l lg:border-white/10"
                        role="group"
                        aria-label="Overzicht winkels en favorieten"
                        aria-busy={winkelsLoading}
                      >
                        {winkelsLoading ? (
                          [0, 1, 2].map(i => (
                            <div key={i} className="space-y-1.5" aria-hidden>
                              <div className="h-2.5 w-14 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.2)' }} />
                              <div className="h-5 w-10 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.28)' }} />
                            </div>
                          ))
                        ) : winkelsVoorGebruiker.length > 0 ? (
                          [{ label: 'Winkels', value: winkelsVoorGebruiker.length }, { label: 'Locaties', value: winkelsVoorGebruiker.filter(w => w.stad).length }, { label: 'Favorieten', value: favorieten.length }].map((s, i) => (
                            <div key={s.label} className="flex items-center gap-2">
                              {i > 0 && <div className="hidden sm:block w-px h-5" style={{ background: 'rgba(255,255,255,0.1)' }} aria-hidden />}
                              <div>
                                <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: '10px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                                <div style={{ color: 'white', fontSize: '16px', fontWeight: 700, fontFamily: F, lineHeight: 1.2 }}>{s.value}</div>
                              </div>
                            </div>
                          ))
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {(newsUnreadData?.count ?? 0) > 0 && (
                <Link
                  href="/dashboard/nieuws"
                  className="block rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-95"
                  style={{
                    background: 'rgba(45,69,124,0.06)',
                    border: '1px solid rgba(45,69,124,0.15)',
                    color: DYNAMO_BLUE,
                    fontFamily: F,
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full text-xs font-bold" style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}>
                      {newsUnreadData?.count ?? 0}
                    </span>
                    Ongelezen nieuwsberichten — open het overzicht
                  </span>
                </Link>
              )}

              <p className="text-pretty text-sm leading-relaxed max-w-2xl m-0" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
                {lunchOnly
                  ? 'Kies hieronder een module om verder te gaan.'
                  : 'Werk per module: open hieronder wat je nodig hebt. Voor voorraad per vestiging kies je daarna een winkel — of gebruik verderop de kaart en snelle zoekfunctie.'}
              </p>

              {/* MODULES — primaire portal-laag */}
              <section className="s2" aria-labelledby="dashboard-heading-modules">
                <div className="flex flex-col gap-2 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 id="dashboard-heading-modules" className="m-0" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: dashboardUi.textSubtle, fontFamily: F }}>{lunchOnly ? 'Modules' : 'Jouw modules'}</h2>
                    <div className="flex-1 min-w-[2rem] h-px" style={{ background: dashboardUi.sectionDivider }} aria-hidden />
                  </div>
                  {!lunchOnly && (
                    <p id="dashboard-modules-hint" className="m-0 text-pretty max-w-3xl" style={{ fontSize: '11px', color: dashboardUi.textSubtle, fontFamily: F }}>
                      Sleep een tegel om de volgorde aan te passen (opgeslagen in je profiel).
                      {' '}
                      <Link href="/dashboard/instellingen" className="font-semibold underline underline-offset-2" style={{ color: DYNAMO_BLUE }}>Instellingen</Link>
                      {' '}voor MFA en lunch-voorkeur.
                    </p>
                  )}
                </div>
                {sessionData !== undefined && orderedModules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed px-5 py-8 text-center" style={{ borderColor: 'rgba(45,69,124,0.22)', background: 'rgba(255,255,255,0.7)' }}>
                    <p className="m-0 text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Geen modules ingeschakeld</p>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
                      Vraag een beheerder om modules te activeren, of open Beheer als je zelf rechten hebt.
                    </p>
                    {isAdmin && (
                      <Link href="/dashboard/beheer" className="mt-4 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                        Naar Beheer
                      </Link>
                    )}
                  </div>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                  {orderedModules.map((id, idx) => {
                    /** Max hoogte gelijk aan compacte tegels (bovenste rij); branche-nieuws scrollt binnen dit kader */
                    const modCardMax = 'max-h-[270px]'
                    const modCard = `mod-card rounded-2xl overflow-hidden ${modCardMax}`
                    const modTitleStyle = { fontFamily: F, color: 'white', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' } as const
                    const dragHandle = !lunchOnly ? (
                      <div
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }}
                        onDragOver={e => e.preventDefault()}
                        onClick={e => { e.preventDefault(); e.stopPropagation() }}
                        className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing opacity-50 hover:opacity-90 transition-opacity"
                        style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.9)' }}
                        title="Sleep om volgorde te wijzigen"
                        aria-label={`Verslepen: module ${id.replace(/-/g, ' ')}`}
                        aria-describedby="dashboard-modules-hint"
                      >
                        <IconGrip />
                      </div>
                    ) : null
                    if (id === 'voorraad') {
                      return (
                        <div key={id} className="relative h-full" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div
                            className={`${modCard} cursor-pointer flex flex-col h-full`}
                            style={{ ...dashboardModuleTile.surface }}
                            onClick={openWinkelSelect}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWinkelSelect() } }}
                            role="button"
                            tabIndex={0}
                            aria-label="Voorraad: kies een winkel om producten te bekijken"
                          >
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...dashboardModuleTile.iconWrap }}>
                                <div style={{ color: 'white' }}><IconBox /></div>
                              </div>
                              <div style={modTitleStyle}>Voorraad</div>
                              <div style={{ ...dashboardModuleTile.subtitle, fontFamily: F }}>Zoek en filter producten per winkel</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...dashboardModuleTile.footer }}>
                              <span style={{ color: 'white', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Selecteer winkel →</span>
                              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', fontFamily: F }}>{winkelsVoorGebruiker.length} locaties</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (id === 'lunch') {
                      return (
                        <div key={id} className="relative h-full" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/lunch" aria-label="Module Lunch bestellen: broodjes bestellen voor op kantoor" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...dashboardModuleTile.surface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...dashboardModuleTile.iconWrap }}>
                                <div style={{ color: 'white' }}><IconLunch /></div>
                              </div>
                              <div style={modTitleStyle}>Lunch bestellen</div>
                              <div style={{ ...dashboardModuleTile.subtitle, fontFamily: F }}>Bestel broodjes voor op kantoor</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...dashboardModuleTile.footer }}>
                              <span style={{ color: 'white', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Bestellen →</span>
                              <div style={{ color: 'rgba(255,255,255,0.45)' }}><IconLunch /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'brand-groep') {
                      return (
                        <div key={id} className="relative h-full" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/brand-groep" aria-label="Module Merk en groep: voorraadanalyse per merk" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...dashboardModuleTile.surface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...dashboardModuleTile.iconWrap }}>
                                <div style={{ color: 'white' }}><IconChart /></div>
                              </div>
                              <div style={modTitleStyle}>Merk / Groep</div>
                              <div style={{ ...dashboardModuleTile.subtitle, fontFamily: F }}>Voorraad per merk en productgroep</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...dashboardModuleTile.footer }}>
                              <span style={{ color: 'white', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Ga naar analyse →</span>
                              <div style={{ color: 'rgba(255,255,255,0.45)' }}><IconChart /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'campagne-fietsen') {
                      return (
                        <div key={id} className="relative h-full" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/campagne-fietsen" aria-label="Module Campagnefietsen: landelijk voorraadoverzicht" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...dashboardModuleTile.surface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...dashboardModuleTile.iconWrap }}>
                                <div style={{ color: 'white' }}><IconBike /></div>
                              </div>
                              <div style={modTitleStyle}>Campagnefietsen</div>
                              <div style={{ ...dashboardModuleTile.subtitle, fontFamily: F }}>Landelijk voorraad per campagnefiets</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...dashboardModuleTile.footer }}>
                              <span style={{ color: 'white', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Bekijk overzicht →</span>
                              <div style={{ color: 'rgba(255,255,255,0.45)' }}><IconBike /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'branche-nieuws') {
                      return (
                        <div key={id} className="relative h-full" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div
                            className={`${modCard} h-full flex flex-col`}
                            style={{ ...dashboardModuleTile.surface }}
                          >
                            {dragHandle}
                            <div className="p-6 flex-1 flex flex-col min-h-0">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 shrink-0" style={{ ...dashboardModuleTile.iconWrap }}>
                                <div style={{ color: 'white' }} aria-hidden><IconNewspaper /></div>
                              </div>
                              <div style={modTitleStyle}>Branche nieuws</div>
                              <div style={{ ...dashboardModuleTile.subtitle, fontFamily: F }}>
                                Actuele artikelen van NieuwsFiets
                              </div>
                              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 -mr-0.5">
                                <BrancheNieuwsModule maxItems={3} compact onDarkBackground />
                              </div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto shrink-0" style={{ ...dashboardModuleTile.footer }}>
                              <a
                                href={BRANCHE_NIEUWS_MEER_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-left"
                                style={{ color: 'white', fontSize: '12px', fontWeight: 600, fontFamily: F }}
                                onClick={e => e.stopPropagation()}
                              >
                                Meer nieuws →
                              </a>
                              <div style={{ color: 'rgba(255,255,255,0.45)' }} aria-hidden><IconNewspaper /></div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (id === 'meer') {
                      return (
                        <div key={id} className="relative h-full" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div className={`mod-card rounded-2xl overflow-hidden flex flex-col h-full ${modCardMax}`} style={{ ...dashboardModuleTile.surface, border: '1px dashed rgba(255,255,255,0.22)' }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...dashboardModuleTile.iconWrap }}>
                                <div style={{ color: 'white' }}><IconMap /></div>
                              </div>
                              <div style={{ fontFamily: F, color: 'white', fontSize: '18px', fontWeight: 600 }}>Meer modules</div>
                              <div style={{ ...dashboardModuleTile.subtitle, fontFamily: F }}>Export, vergelijking, alerts</div>
                            </div>
                            <div className="px-6 py-3 mt-auto" style={{ ...dashboardModuleTile.footer }}>
                              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Binnenkort beschikbaar</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
                )}
              </section>

              {/* LOCATIES — vestigingscontext (o.a. voorraad); ondersteunt module-keuze */}
              {!lunchOnly && (
              <section className="s3" aria-labelledby="dashboard-heading-locaties">
                <div className="flex flex-col gap-2 sm:gap-3 mb-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 id="dashboard-heading-locaties" className="m-0" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: dashboardUi.textSubtle, fontFamily: F }}>Locaties & vestiging</h2>
                    <div className="flex-1 min-w-[2rem] h-px" style={{ background: dashboardUi.sectionDivider }} aria-hidden />
                  </div>
                  <p className="m-0 text-sm max-w-3xl text-pretty" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
                    Voor modules die per winkel werken: kies je vestiging op de kaart of via de zoekbalk. Filters gelden voor de kaart en de winkelkaarten hieronder.
                  </p>
                </div>

                {winkelsVoorGebruiker.length > 0 && (
                  <div className="mb-4 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-start">
                    <div className="relative flex-1 min-w-0 max-w-md">
                      <label htmlFor="dashboard-winkel-quick" className="sr-only">Zoek winkel op naam, plaats of postcode</label>
                      <input
                        id="dashboard-winkel-quick"
                        type="search"
                        autoComplete="off"
                        value={winkelQuickZoek}
                        onChange={e => setWinkelQuickZoek(e.target.value)}
                        placeholder="Zoek op naam, plaats of postcode…"
                        className="w-full rounded-xl px-3 py-2.5 text-sm"
                        style={{ background: 'white', border: `1px solid ${dashboardUi.borderSoft}`, color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                      />
                      {winkelsQuickPick.length > 0 && (
                        <ul
                          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-xl border bg-white py-1 shadow-lg"
                          style={{ borderColor: 'rgba(45,69,124,0.12)' }}
                          role="listbox"
                          aria-label="Zoekresultaten winkels"
                        >
                          {winkelsQuickPick.map(w => (
                            <li key={w.id} role="option">
                              <button
                                type="button"
                                className="w-full px-3 py-2.5 text-left text-sm transition hover:bg-dynamo-blue/5"
                                style={{ fontFamily: F, color: DYNAMO_BLUE }}
                                onClick={() => { void selecteerWinkel(w); setWinkelQuickZoek('') }}
                              >
                                <span className="font-semibold">{w.naam}</span>
                                {(w.stad || w.postcode) && (
                                  <span className="block text-xs mt-0.5" style={{ color: dashboardUi.textMuted }}>
                                    {[w.stad, w.postcode].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={kaartFilterLand} onChange={e => setKaartFilterLand(e.target.value as 'alle' | 'Netherlands' | 'Belgium')} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(45,69,124,0.12)', color: 'rgba(45,69,124,0.8)', fontFamily: F }} aria-label="Filter kaart op land">
                      <option value="alle">Alle landen</option>
                      <option value="Netherlands">Nederland</option>
                      <option value="Belgium">België</option>
                    </select>
                    <select value={kaartFilterKassaPakket} onChange={e => setKaartFilterKassaPakket(e.target.value as 'alle' | 'cyclesoftware' | 'wilmar' | 'vendit')} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(45,69,124,0.12)', color: 'rgba(45,69,124,0.8)', fontFamily: F }} aria-label="Filter kaart op kassapakket">
                      <option value="alle">Kassa pakket: alle</option>
                      <option value="cyclesoftware">CycleSoftware</option>
                      <option value="wilmar">Wilmar</option>
                      <option value="vendit">Vendit</option>
                    </select>
                    <select value={kaartFilterBikeTotaal} onChange={e => setKaartFilterBikeTotaal(e.target.value as 'alle' | 'ja' | 'nee')} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(45,69,124,0.12)', color: 'rgba(45,69,124,0.8)', fontFamily: F }} aria-label="Filter kaart op Bike Totaal">
                      <option value="alle">Bike Totaal: alle</option>
                      <option value="ja">Bike Totaal: ja</option>
                      <option value="nee">Bike Totaal: nee</option>
                    </select>
                  </div>
                  {kaartFiltersActief && (
                    <button type="button" onClick={resetKaartFilters} className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition hover:opacity-90" style={{ background: 'rgba(45,69,124,0.06)', borderColor: 'rgba(45,69,124,0.15)', color: DYNAMO_BLUE, fontFamily: F }}>
                      Alles tonen
                    </button>
                  )}
                  <span style={{ fontSize: '11px', color: dashboardUi.textSubtle, fontFamily: F }} aria-live="polite">
                    {winkelsLoading ? 'Kaart laden…' : `${winkelsGefilterd.filter(w => w.lat && w.lng).length} van ${winkelsGefilterd.length} op kaart`}
                  </span>
                </div>
                <p className="text-xs mb-4 m-0 max-w-3xl" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
                  Tip: staan alle filters op “alle”, dan zie je alle locaties die aan je account zijn gekoppeld.
                </p>

                <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: '0 4px 24px rgba(45,69,124,0.08)', border: `1px solid ${dashboardUi.borderSoft}` }}>
                  {showKaartFilterEmpty && (
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ background: 'rgba(45,69,124,0.06)', borderColor: 'rgba(45,69,124,0.1)' }}>
                      <p className="m-0 text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Geen locaties met deze filters</p>
                      <button type="button" onClick={resetKaartFilters} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 shrink-0" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                        Alle filters resetten
                      </button>
                    </div>
                  )}
                  {winkelsLoading ? (
                    <div className="flex items-center justify-center gap-3 px-4 py-16" style={{ background: 'rgba(45,69,124,0.06)', fontFamily: F }} role="status" aria-live="polite">
                      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: DYNAMO_BLUE }} />
                      <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Winkels en kaart laden…</span>
                    </div>
                  ) : winkelsGefilterd.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
                      {winkelsVoorGebruiker.length === 0
                        ? 'Geen locaties gekoppeld aan dit account.'
                        : showKaartFilterEmpty
                          ? 'Geen locaties binnen deze filters — gebruik de balk hierboven om te resetten.'
                          : 'Geen locaties om te tonen.'}
                    </div>
                  ) : (
                    <WinkelKaart winkels={winkelsGefilterd} onSelecteer={selecteerWinkel} onGeocode={haalLocatiesOp} onGeocodeBelgium={haalBelgieLocatiesOp} isAdmin={isAdmin} geocodeLoading={geocodeLoading} geocodeResult={geocodeResult} onDismissGeocodeResult={() => setGeocodeResult(null)} />
                  )}
                </div>

                {winkelsGefilterd.length > 0 && (
                  <div className="mt-8 space-y-6">
                    {favorieten.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: DYNAMO_BLUE, fontFamily: F }}>★ Mijn winkels</span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(45,69,124,0.2)' }} />
                          <span style={{ fontSize: '11px', color: 'rgba(45,69,124,0.3)', fontFamily: F }}>{winkelsGefilterd.filter(w => favorieten.includes(w.id)).length} favoriet{winkelsGefilterd.filter(w => favorieten.includes(w.id)).length !== 1 ? 'en' : ''}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {winkelsGefilterd.filter(w => favorieten.includes(w.id)).map(w => (
                            <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[winkelsGefilterd.indexOf(w) % WINKEL_KLEUREN.length]} favoriet={true} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Alle winkels</span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(45,69,124,0.08)' }} />
                        <span style={{ fontSize: '11px', color: 'rgba(45,69,124,0.3)', fontFamily: F }}>{winkelsGefilterd.length} locaties</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {winkelsGefilterd.map((w, i) => (
                          <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]} favoriet={favorieten.includes(w.id)} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
              )}

            </div>

          ) : (
            <>
              {loading && (
                <div className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4" style={{ background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }} role="status" aria-live="polite" aria-busy="true">
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} aria-hidden />
                  <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Voorraad laden voor {geselecteerdeWinkel.naam}…</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => { try { localStorage.removeItem(WINKEL_STORAGE_KEY) } catch {}; setGeselecteerdeWinkel(null); router.push('/dashboard') }}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-90"
                style={{ color: DYNAMO_BLUE, fontFamily: F, background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.12)' }}
              >
                <IconArrowLeft aria-hidden /> Terug naar modules en kaart
              </button>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {[
                  { label: 'Producten', value: stats.producten, vorig: vorigeStats?.producten, color: DYNAMO_BLUE },
                  { label: 'Totaal voorraad', value: stats.voorraad, vorig: vorigeStats?.voorraad, color: DYNAMO_BLUE },
                  { label: 'Fietsen op voorraad', value: stats.fietsen, color: '#16a34a' },
                  { label: 'Merken', value: stats.merken, color: DYNAMO_BLUE },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl px-3 sm:px-5 py-3 sm:py-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
                    <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(45,69,124,0.4)', letterSpacing: '0.08em', fontFamily: F }}>{s.label}</div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl font-bold" style={{ color: s.color, fontFamily: F, letterSpacing: '-0.03em' }}>{loading ? '...' : s.value.toLocaleString('nl-NL')}</div>
                      {!loading && trendPijl(s.value, (s as any).vorig)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Zoekbalk */}
              <div className="rounded-2xl p-3 sm:p-4" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{geselecteerdeWinkel.naam}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.45)', fontFamily: F }}>#{dealer}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.6)', fontFamily: F }} title={getDatum()}>{new Date().toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      {temperatuur != null && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.6)', fontFamily: F }} title={geselecteerdeWinkel.stad ? `Temperatuur ${geselecteerdeWinkel.stad}` : 'Temperatuur locatie'}>{Math.round(temperatuur)}°C {geselecteerdeWinkel.stad ? `(${geselecteerdeWinkel.stad})` : ''}</span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                        {bron === 'wilmar' ? 'Wilmar' : (bron === 'vendit' || bron === 'vendit_api') ? 'Vendit' : 'CycleSoftware'}
                      </span>
                      {bron === 'vendit' && (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.08)', color: 'rgba(45,69,124,0.7)', fontFamily: F }} title={venditLaatstDatum ? 'Laatste voorraadsync uit vendit_stock' : 'Geen datum beschikbaar: vendit_stock heeft geen data voor dit dealer_nummer of de timestamp-kolom is leeg'}>
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
                      {geselecteerdeWinkel.stad && <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(45,69,124,0.4)' }}><IconPin />{geselecteerdeWinkel.stad}</span>}
                      {geselecteerdeWinkel.land && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: geselecteerdeWinkel.land === 'Belgium' ? 'rgba(253,218,36,0.2)' : 'rgba(255,102,0,0.15)', color: geselecteerdeWinkel.land === 'Belgium' ? '#a16207' : '#c2410c', fontFamily: F }}>{geselecteerdeWinkel.land === 'Belgium' ? 'België' : 'Nederland'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link href={geselecteerdeWinkel ? `/dashboard/brand-groep?winkel=${geselecteerdeWinkel.id}` : '/dashboard/brand-groep'} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-80 shrink-0" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.08)', fontFamily: F }}>
                        <IconChart /> Merk/Groep
                      </Link>
                      <span className="text-xs shrink-0" style={{ color: 'rgba(45,69,124,0.35)', fontFamily: F }}>
                        {loading ? 'Laden...' : `${gefilterdEnGesorteerd.length} resultaten`}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(45,69,124,0.3)' }}>⌕</span>
                      <input type="text" placeholder="Zoek op product, merk, barcode..." value={zoekterm} onChange={e => setZoekterm(e.target.value)} className="w-full rounded-xl px-3 py-2 pl-9 text-sm" style={inputStyle} />
                    </div>
                    <select value={zoekKolom} onChange={e => setZoekKolom(e.target.value)} className="rounded-xl px-3 py-2 text-sm w-full sm:w-auto min-w-0" style={inputStyle}>
                      <option value="ALL">Alle kolommen</option>
                      {kolommen.map(k => <option key={k} value={k}>{columnLabel(k)}</option>)}
                    </select>
                    <div className="relative">
                      <button ref={kolomTriggerRef} onClick={() => setKolomPanelOpen(v => !v)} aria-expanded={kolomPanelOpen} aria-haspopup="dialog" aria-label="Kolommen kiezen" className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 flex items-center gap-2" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                        ⚙ Kolommen ({zichtbareKolommen.length})
                      </button>
                      {kolomPanelOpen && (
                        <div ref={kolomPanelRef} role="dialog" aria-label="Kolommen configuratie" className="absolute right-0 left-0 sm:left-auto mt-2 w-full sm:w-72 max-w-sm rounded-2xl bg-white shadow-xl p-4 z-20" style={{ border: '1px solid rgba(45,69,124,0.1)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Kolommen</span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none" aria-label="Sluiten">✕</button>
                          </div>
                          <p className="text-xs mb-3" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Voorkeur wordt automatisch onthouden.</p>
                          <div className="flex gap-2 mb-3">
                            <button onClick={() => setZichtbareKolommen([...kolommen])} className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:bg-gray-50" style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Alles aan</button>
                            <button onClick={() => setZichtbareKolommen(prev => prev.length > 1 ? [prev[0]] : prev)} className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:bg-gray-50" style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Alles uit</button>
                          </div>
                          <div className="space-y-1 max-h-64 overflow-auto">
                            {kolommen.map(k => (
                              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5">
                                <input type="checkbox" checked={zichtbareKolommen.includes(k)} onChange={() => toggleKolom(k)} disabled={zichtbareKolommen.includes(k) && zichtbareKolommen.length === 1} className="accent-[#2D457C]" />
                                <span style={{ color: DYNAMO_BLUE, fontFamily: F }}>{columnLabel(k)}</span>
                                {isSticky(k) && <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Vast</span>}
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
                <div className="rounded-2xl p-4 text-sm" style={{ background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.2)' }}>
                  <p className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Toestemming vereist</p>
                  <p className="mt-1" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{authRequired.message}</p>
                </div>
              )}

              {/* Tabel */}
              <div className="rounded-2xl overflow-hidden -mx-3 sm:mx-0" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
                <div className="overflow-x-auto overflow-y-visible" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm min-w-[600px] [border-collapse:separate] [border-spacing:0]">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        {zichtbareKolommen.map(k => {
                          const active = sortKey === k
                          const sticky = stickyEnabled && stickyKey === k
                          return (
                            <th key={k} scope="col" className="px-4 py-3 text-left" style={{ color: active ? 'white' : 'rgba(255,255,255,0.7)', background: DYNAMO_BLUE, fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F, position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined, zIndex: sticky ? 60 : undefined, minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
                              <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:opacity-80 transition">
                                {columnLabel(k)}
                                <span style={{ color: active ? 'white' : 'rgba(255,255,255,0.25)' }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                              </button>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 12 }).map((_, i) => (
                          <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid rgba(45,69,124,0.05)' }}>
                            {zichtbareKolommen.map(k => <td key={k} className="px-4 py-3"><div className="h-3 rounded" style={{ background: 'rgba(45,69,124,0.06)', width: '80px' }} /></td>)}
                          </tr>
                        ))
                      ) : gefilterdEnGesorteerd.length === 0 ? (
                        <tr>
                          <td colSpan={zichtbareKolommen.length} className="px-6 py-16 text-center">
                            <div className="text-3xl mb-3" aria-hidden>🔍</div>
                            <div className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                              {zoekterm.trim() !== '' || zoekKolom !== 'ALL'
                                ? 'Geen resultaten met deze zoekfilters'
                                : producten.length === 0
                                  ? 'Geen voorraadgegevens voor deze winkel'
                                  : 'Geen producten met voorraad (we tonen alleen artikelen met voorraad ≥ 1)'}
                            </div>
                            <div className="text-sm mt-2 max-w-sm mx-auto leading-relaxed" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                              {zoekterm.trim() !== '' || zoekKolom !== 'ALL'
                                ? 'Pas de zoekterm aan of wis de filters om alles weer te tonen.'
                                : 'Controleer de koppeling in Beheer of kies een andere locatie.'}
                            </div>
                            {(zoekterm.trim() !== '' || zoekKolom !== 'ALL') && (
                              <button type="button" onClick={() => { setZoekterm(''); setZoekKolom('ALL') }} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                                Wis zoekfilters
                              </button>
                            )}
                          </td>
                        </tr>
                      ) : (
                        gefilterdEnGesorteerd.map((p, i) => (
                          <tr key={i} className="transition hover:bg-dynamo-blue/5" style={{ borderBottom: '1px solid rgba(45,69,124,0.05)', background: i % 2 === 1 ? 'rgba(45,69,124,0.015)' : 'white' }}>
                            {zichtbareKolommen.map(k => {
                              const sticky = stickyEnabled && stickyKey === k
                              const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                              const stockVal = Number(p[k])
                              return (
                                <td key={k} className="px-4 py-2.5 align-middle" style={{ ...(sticky ? { position: 'sticky', left: 0, background: 'white', zIndex: 40, boxShadow: '2px 0 0 0 rgba(45,69,124,0.06)' } : {}), minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
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
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(45,69,124,0.06)' }}>
                    <span className="text-xs" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>{gefilterdEnGesorteerd.length} producten</span>
                    <span className="text-xs" style={{ color: 'rgba(45,69,124,0.3)', fontFamily: F }}>Klik op kolomheader om te sorteren</span>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
    </div>
  )
}