'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'
const KOLOMMEN_STORAGE_KEY = 'dynamo_zichtbare_kolommen'
const F = "'Outfit', sans-serif"

const WINKEL_KLEUREN = [
  '#2563eb', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#65a30d', '#db2777',
]

const COLUMN_CONFIG: Record<string, { label?: string; hidden?: boolean; order?: number; sticky?: boolean; format?: 'money' | 'int' | 'text' }> = {
  PRODUCT_DESCRIPTION: { label: 'Product', order: 10, sticky: true, format: 'text' },
  BRAND_NAME: { label: 'Merk', order: 20, format: 'text' },
  BARCODE: { label: 'Barcode', order: 30, format: 'text' },
  SUPPLIER_PRODUCT_NUMBER: { label: 'Art. nummer', order: 40, format: 'text' },
  STOCK: { label: 'Voorraad', order: 50, format: 'int' },
  AVAILABLE_STOCK: { label: 'Beschikbaar', order: 60, format: 'int' },
  RESERVED: { label: 'Gereserveerd', order: 65, format: 'int' },
  SOLD: { label: 'Verkocht', order: 67, format: 'int' },
  SALES_PRICE_INC: { label: 'Prijs incl.', order: 70, format: 'money' },
  GROUP_DESCRIPTION_1: { label: 'Groep', order: 80, format: 'text' },
  GROUP_DESCRIPTION_2: { label: 'Subgroep', order: 90, format: 'text' },
  SUPPLIER_NAME: { label: 'Leverancier', order: 100, format: 'text' },
  FRAME_NUMBER: { label: 'Framenummer', order: 35, format: 'text' },
COLOR: { label: 'Kleur', order: 45, format: 'text' },
FRAME_HEIGHT: { label: 'Framehoogte', order: 46, format: 'text' },
GENDER: { label: 'Geslacht', order: 47, format: 'text' },
WHEEL_SIZE: { label: 'Wielmaat', order: 48, format: 'text' },
GEAR: { label: 'Versnelling', order: 49, format: 'text' },
CATEGORY: { label: 'Categorie', order: 75, format: 'text' },
LOCATION: { label: 'Locatie', order: 76, format: 'text' },
MODEL_YEAR: { label: 'Modeljaar', order: 77, format: 'text' },
IS_NEW: { label: 'Nieuw/Occasion', order: 78, format: 'text' },
}

function columnLabel(key: string) { return COLUMN_CONFIG[key]?.label ?? key.replace(/_/g, ' ') }
function columnOrder(key: string) { return COLUMN_CONFIG[key]?.order ?? 1000 }
function isHidden(key: string) { return COLUMN_CONFIG[key]?.hidden ?? false }
function isSticky(key: string) { return COLUMN_CONFIG[key]?.sticky ?? false }

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
  return g.includes('fiets') || g.includes('bike') || g.includes('cycle') || g.includes('ebike') || g.includes('e-bike')
}

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
  postcode?: string
  stad?: string
  lat?: number
  lng?: number
  wilmar_organisation_id?: number
  wilmar_branch_id?: number
  api_type?: 'cyclesoftware' | 'wilmar' | null
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
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: kleur }} onClick={() => onSelecteer(w)}>
            {w.naam.charAt(0)}
          </div>
          <div className="min-w-0 flex-1" onClick={() => onSelecteer(w)}>
            <div className="font-semibold text-sm truncate" style={{ color: DYNAMO_BLUE, fontFamily: F, letterSpacing: '-0.01em' }}>{w.naam}</div>
            <div style={{ color: 'rgba(13,31,78,0.35)', fontSize: '11px', fontFamily: F }}>#{w.dealer_nummer}</div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavoriet(w.id) }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition hover:opacity-70 shrink-0"
            style={{ background: favoriet ? `${DYNAMO_GOLD}20` : 'rgba(13,31,78,0.04)', border: favoriet ? `1px solid ${DYNAMO_GOLD}60` : '1px solid rgba(13,31,78,0.08)' }}
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

function WinkelKaart({ winkels, onSelecteer }: { winkels: Winkel[]; onSelecteer: (w: Winkel) => void }) {
  const winkelsMetCoords = winkels.filter(w => w.lat && w.lng)

  useEffect(() => {
    if (winkelsMetCoords.length === 0) return
    if (typeof window === 'undefined') return

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => {
      const L = (window as any).L
      const mapEl = document.getElementById('winkel-kaart')
      if (!mapEl || (mapEl as any)._leaflet_id) return

      const map = L.map('winkel-kaart', { zoomControl: true, scrollWheelZoom: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map)

      const bounds: [number, number][] = []
      winkelsMetCoords.forEach((w, i) => {
        const kleur = WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]
        const icon = L.divIcon({
          html: `<div style="background:${kleur};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="transform:rotate(45deg);color:white;font-size:12px;font-weight:bold;text-align:center;line-height:26px;">${w.naam.charAt(0)}</div></div>`,
          className: '', iconSize: [32, 32], iconAnchor: [16, 32],
        })
        const marker = L.marker([w.lat!, w.lng!], { icon })
        marker.addTo(map)
        marker.bindPopup(`<div style="font-family:sans-serif;min-width:140px"><div style="font-weight:bold;color:${DYNAMO_BLUE};font-size:13px">${w.naam}</div><div style="color:#6b7280;font-size:11px;margin-top:2px">${w.stad || w.postcode || ''}</div><button onclick="window._selectWinkel(${w.id})" style="margin-top:8px;width:100%;background:${DYNAMO_BLUE};color:white;border:none;border-radius:6px;padding:6px;font-size:12px;cursor:pointer;font-weight:bold;">Bekijk voorraad →</button></div>`)
        bounds.push([w.lat!, w.lng!])
      })

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] })
      ;(window as any)._selectWinkel = (id: number) => {
        const winkel = winkels.find(w => w.id === id)
        if (winkel) onSelecteer(winkel)
      }
    }
    document.head.appendChild(script)

    return () => {
      const mapEl = document.getElementById('winkel-kaart')
      if (mapEl && (mapEl as any)._leaflet_id) {
        ;(window as any).L?.map(mapEl)?.remove?.()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winkelsMetCoords.length])

  if (winkelsMetCoords.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ height: 280, background: 'rgba(13,31,78,0.03)', borderRadius: '16px', border: '1px dashed rgba(13,31,78,0.15)' }}>
        <div className="text-center p-6">
          <div className="flex justify-center mb-2" style={{ color: 'rgba(13,31,78,0.2)' }}><IconMap /></div>
          <p className="text-sm font-medium" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Geen kaart beschikbaar</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(13,31,78,0.3)', fontFamily: F }}>Voeg postcodes toe aan je winkels</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: 320, borderRadius: '16px', overflow: 'hidden' }}>
      <div id="winkel-kaart" style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

export default function Dashboard() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)
  const [producten, setProducten] = useState<Product[]>([])
  const [kolommen, setKolommen] = useState<string[]>([])
  const [zichtbareKolommen, setZichtbareKolommen] = useState<string[]>([])
  const [kolommenGeladen, setKolommenGeladen] = useState(false)
  const [zoekterm, setZoekterm] = useState('')
  const [debouncedZoekterm, setDebouncedZoekterm] = useState('')
  const [zoekKolom, setZoekKolom] = useState<string>('ALL')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [winkelLoading, setWinkelLoading] = useState(false)
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [nieuwDealer, setNieuwDealer] = useState('')
  const [nieuwePostcode, setNieuwePostcode] = useState('')
  const [nieuweStad, setNieuweStad] = useState('')
  const [bewerkWinkel, setBewerkWinkel] = useState<Winkel | null>(null)
  const [bewerkLoading, setBewerkLoading] = useState(false)
  const [kolomPanelOpen, setKolomPanelOpen] = useState(false)
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [gebruiker, setGebruiker] = useState('')
  const [authRequired, setAuthRequired] = useState<null | { message: string }>(null)
  const [vorigeStats, setVorigeStats] = useState<{ producten: number; voorraad: number } | null>(null)
  const [favorieten, setFavorieten] = useState<number[]>([])

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    try {
      const opgeslagen = localStorage.getItem(KOLOMMEN_STORAGE_KEY)
      if (opgeslagen) {
        const parsed = JSON.parse(opgeslagen)
        if (Array.isArray(parsed) && parsed.length > 0) setZichtbareKolommen(parsed)
      }
    } catch {}
    setKolommenGeladen(true)
    try {
      const fav = localStorage.getItem('dynamo_favorieten')
      if (fav) setFavorieten(JSON.parse(fav))
    } catch {}
  }, [])

  useEffect(() => {
    if (!kolommenGeladen || zichtbareKolommen.length === 0) return
    try { localStorage.setItem(KOLOMMEN_STORAGE_KEY, JSON.stringify(zichtbareKolommen)) } catch {}
  }, [zichtbareKolommen, kolommenGeladen])

  const haalWinkelsOp = useCallback(async () => {
    const res = await fetch('/api/winkels')
    const data = await res.json()
    setWinkels(data)
  }, [])

  const haalVoorraadOp = useCallback(async (winkel: Winkel, q: string) => {
    setLoading(true)
    setAuthRequired(null)

    const isWilmar = winkel.api_type === 'wilmar' ||
      (!winkel.api_type && !!(winkel.wilmar_branch_id && winkel.wilmar_organisation_id))

    if (isWilmar && winkel.wilmar_organisation_id && winkel.wilmar_branch_id) {
      const url = `/api/wilmar?action=bicycles&organisationId=${winkel.wilmar_organisation_id}&branchId=${winkel.wilmar_branch_id}${q ? `&q=${encodeURIComponent(q)}` : ''}`
      const res = await fetch(url)
      const data = await res.json().catch(() => ([]))
      if (!res.ok) {
        setProducten([]); setKolommen([])
        setAuthRequired({ message: data?.error ?? 'Wilmar voorraad ophalen mislukt.' })
        setLoading(false)
        return
      }
      const items: Product[] = Array.isArray(data) ? data.filter((p: any) => p.BARCODE) : []
setProducten(items)
const wilmarKols = ['BARCODE', 'STOCK', 'AVAILABLE_STOCK', 'RESERVED', 'SOLD']
setKolommen(wilmarKols)
setZichtbareKolommen(wilmarKols)
    }

    // CycleSoftware
    const params = new URLSearchParams()
    params.set('winkel', String(winkel.id))
    params.set('dealer', winkel.dealer_nummer)
    params.set('q', q)
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
    haalWinkelsOp()
    supabase.auth.getUser().then(({ data }) => setGebruiker(data.user?.email ?? ''))
  }, [haalWinkelsOp])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedZoekterm(zoekterm), 400)
    return () => clearTimeout(t)
  }, [zoekterm])

  useEffect(() => {
    if (!geselecteerdeWinkel) return
    haalVoorraadOp(geselecteerdeWinkel, debouncedZoekterm)
  }, [debouncedZoekterm, geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    setVorigeStats(producten.length > 0 ? {
      producten: producten.length,
      voorraad: producten.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    } : null)
    setGeselecteerdeWinkel(winkel)
    setZoekterm(''); setDebouncedZoekterm(''); setProducten([]); setKolommen([])
    setSortKey(''); setZoekKolom('ALL'); setKolomPanelOpen(false); setAuthRequired(null)
    await haalVoorraadOp(winkel, '')
  }

  async function voegWinkelToe(e: React.FormEvent) {
    e.preventDefault()
    setWinkelLoading(true)
    await fetch('/api/winkels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ naam: nieuweNaam, dealer_nummer: nieuwDealer, postcode: nieuwePostcode, stad: nieuweStad }) })
    setNieuweNaam(''); setNieuwDealer(''); setNieuwePostcode(''); setNieuweStad('')
    setToonWinkelForm(false); setWinkelLoading(false)
    await haalWinkelsOp()
  }

  async function slaWinkelOp(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkWinkel) return
    setBewerkLoading(true)
    await fetch('/api/winkels', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bewerkWinkel.id, naam: bewerkWinkel.naam, dealer_nummer: bewerkWinkel.dealer_nummer, postcode: bewerkWinkel.postcode, stad: bewerkWinkel.stad }) })
    setBewerkLoading(false); setBewerkWinkel(null)
    await haalWinkelsOp()
  }

  async function verwijderWinkel(id: number) {
    if (!confirm('Winkel verwijderen?')) return
    await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })
    if (geselecteerdeWinkel?.id === id) { setGeselecteerdeWinkel(null); setProducten([]); setKolommen([]); setZoekterm(''); setAuthRequired(null) }
    await haalWinkelsOp()
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

  function toggleFavoriet(id: number) {
    setFavorieten(prev => {
      const nieuw = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem('dynamo_favorieten', JSON.stringify(nieuw)) } catch {}
      return nieuw
    })
  }

  const isDebouncing = zoekterm !== debouncedZoekterm
  const stickyKey = kolommen.find(isSticky)
  const stickyEnabled = !!stickyKey && zichtbareKolommen.includes(stickyKey)
  const dealer = geselecteerdeWinkel?.dealer_nummer ?? ''
  const bron = geselecteerdeWinkel?.api_type === 'wilmar'
    ? 'wilmar'
    : (!geselecteerdeWinkel?.api_type && geselecteerdeWinkel?.wilmar_branch_id && geselecteerdeWinkel?.wilmar_organisation_id)
      ? 'wilmar'
      : 'cyclesoftware'

  const gefilterdEnGesorteerd = useMemo(() => {
    let arr = bron === 'wilmar'
      ? producten.filter(p => p.BARCODE && p.BARCODE !== '')
      : producten.filter(p => (Number(p?.STOCK) || 0) >= 1)

    if (zoekKolom !== 'ALL' && debouncedZoekterm.trim() !== '') {
      const needle = debouncedZoekterm.toLowerCase()
      arr = arr.filter(p => String(p[zoekKolom] ?? '').toLowerCase().includes(needle))
    } else if (zoekKolom === 'ALL' && debouncedZoekterm.trim() !== '') {
      const needle = debouncedZoekterm.toLowerCase()
      arr = arr.filter(p => Object.values(p).some(v => String(v ?? '').toLowerCase().includes(needle)))
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
  }, [producten, zoekKolom, debouncedZoekterm, sortKey, sortDir, bron])

  const stats = useMemo(() => ({
    producten: gefilterdEnGesorteerd.length,
    voorraad: gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    fietsen: bron === 'wilmar' ? 0 : gefilterdEnGesorteerd.filter(p => isFiets(p) && (Number(p.STOCK) || 0) > 0).reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    merken: bron === 'wilmar' ? 0 : new Set(gefilterdEnGesorteerd.map(p => p.BRAND_NAME)).size,
  }), [gefilterdEnGesorteerd, bron])

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
      <header style={{ background: DYNAMO_BLUE, fontFamily: F }} className="sticky top-0 z-30">
        <div className="px-5 flex items-stretch" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3 pr-6" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black" style={{ background: DYNAMO_GOLD }}>
              <span style={{ color: DYNAMO_BLUE, fontFamily: F, fontWeight: 800, fontSize: '15px' }}>D</span>
            </div>
            <div>
              <div className="font-bold text-sm text-white leading-tight" style={{ letterSpacing: '0.06em', fontFamily: F }}>DYNAMO</div>
              <div className="text-xs font-semibold leading-tight" style={{ color: DYNAMO_GOLD, letterSpacing: '0.12em', fontFamily: F }}>RETAIL GROUP</div>
            </div>
          </div>
          <div className="flex items-center px-5 gap-2" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs font-semibold uppercase hidden sm:block" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', fontFamily: F }}>Winkel</span>
            <select
              value={geselecteerdeWinkel?.id ?? ''}
              onChange={e => { const w = winkels.find(w => w.id === Number(e.target.value)); if (w) selecteerWinkel(w) }}
              className="text-sm rounded-lg px-3 py-1.5 cursor-pointer min-w-[170px]"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F, outline: 'none' }}
            >
              <option value="" disabled className="text-gray-900">Kies winkel...</option>
              {winkels.map(w => <option key={w.id} value={w.id} className="text-gray-900">{w.naam}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 pl-4">
            <button onClick={() => setSidebarOpen(v => !v)} className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:opacity-70" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="flex flex-col gap-1 w-3.5">
                <span className="block h-px bg-white rounded" />
                <span className="block h-px bg-white rounded" />
                <span className="block h-px bg-white rounded" />
              </span>
            </button>
            <span className="text-xs hidden md:block px-2" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: F }}>{gebruiker}</span>
            <Link href="/dashboard/beheer" className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 hidden md:flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Beheer
            </Link>
            <button onClick={uitloggen} className="rounded-lg px-4 py-1.5 text-xs font-bold transition hover:opacity-90" style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE, fontFamily: F }}>
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="flex flex-col transition-all duration-200 overflow-hidden" style={{ width: sidebarOpen ? '256px' : '0px', minWidth: sidebarOpen ? '256px' : '0px', background: '#f8f9fc', borderRight: '1px solid rgba(13,31,78,0.07)', fontFamily: F }}>
          <div className={sidebarOpen ? 'flex flex-col h-full p-4 gap-3' : 'hidden'}>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs font-bold uppercase" style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.1em', fontFamily: F }}>Winkels</span>
              <button onClick={() => setToonWinkelForm(v => !v)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold transition hover:opacity-80" style={{ background: DYNAMO_BLUE, fontSize: '18px' }}>+</button>
            </div>

            {toonWinkelForm && (
              <form onSubmit={voegWinkelToe} className="rounded-xl p-3 space-y-2" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)' }}>
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe winkel</p>
                <input placeholder="Naam winkel" value={nieuweNaam} onChange={e => setNieuweNaam(e.target.value)} className={inputClass + ' w-full'} style={inputStyle} required />
                <input placeholder="Dealer nummer" value={nieuwDealer} onChange={e => setNieuwDealer(e.target.value)} className={inputClass + ' w-full'} style={inputStyle} required />
                <input placeholder="Postcode" value={nieuwePostcode} onChange={e => setNieuwePostcode(e.target.value)} className={inputClass + ' w-full'} style={inputStyle} />
                <input placeholder="Stad" value={nieuweStad} onChange={e => setNieuweStad(e.target.value)} className={inputClass + ' w-full'} style={inputStyle} />
                <div className="flex gap-2">
                  <button type="submit" disabled={winkelLoading} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{winkelLoading ? 'Bezig...' : 'Toevoegen'}</button>
                  <button type="button" onClick={() => setToonWinkelForm(false)} className="rounded-lg border px-3 text-sm hover:bg-gray-50" style={{ borderColor: 'rgba(13,31,78,0.1)' }}>✕</button>
                </div>
              </form>
            )}

            {bewerkWinkel && (
              <form onSubmit={slaWinkelOp} className="rounded-xl p-3 space-y-2" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}` }}>
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>✏️ Bewerken</p>
                <input placeholder="Naam winkel" value={bewerkWinkel.naam} onChange={e => setBewerkWinkel({ ...bewerkWinkel, naam: e.target.value })} className={inputClass + ' w-full'} style={inputStyle} required />
                <input placeholder="Dealer nummer" value={bewerkWinkel.dealer_nummer} onChange={e => setBewerkWinkel({ ...bewerkWinkel, dealer_nummer: e.target.value })} className={inputClass + ' w-full'} style={inputStyle} required />
                <input placeholder="Postcode" value={bewerkWinkel.postcode ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, postcode: e.target.value })} className={inputClass + ' w-full'} style={inputStyle} />
                <input placeholder="Stad" value={bewerkWinkel.stad ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, stad: e.target.value })} className={inputClass + ' w-full'} style={inputStyle} />
                <div className="flex gap-2">
                  <button type="submit" disabled={bewerkLoading} className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{bewerkLoading ? 'Opslaan...' : 'Opslaan'}</button>
                  <button type="button" onClick={() => setBewerkWinkel(null)} className="rounded-lg border px-3 text-sm hover:bg-gray-50" style={{ borderColor: 'rgba(13,31,78,0.1)' }}>✕</button>
                </div>
              </form>
            )}

            <div className="flex-1 overflow-y-auto space-y-1">
              {winkels.map((w, i) => {
                const active = geselecteerdeWinkel?.id === w.id
                const kleur = WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]
                return (
                  <div key={w.id} onClick={() => selecteerWinkel(w)} className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer transition-all" style={active ? { background: DYNAMO_BLUE, boxShadow: '0 2px 12px rgba(13,31,78,0.2)' } : { background: 'white', border: '1px solid rgba(13,31,78,0.07)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: active ? 'rgba(255,255,255,0.15)' : kleur }}>{w.naam.charAt(0)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: active ? 'white' : DYNAMO_BLUE, fontFamily: F, letterSpacing: '-0.01em' }}>{w.naam}</div>
                      <div className="text-xs flex items-center gap-1" style={{ color: active ? 'rgba(255,255,255,0.45)' : 'rgba(13,31,78,0.35)', fontFamily: F }}>
                        {w.stad ? <><IconPin />{w.stad}</> : `#${w.dealer_nummer}`}
                        {w.api_type === 'wilmar' && <span className="ml-1 text-xs px-1 rounded" style={{ background: active ? 'rgba(255,255,255,0.15)' : 'rgba(22,163,74,0.1)', color: active ? 'rgba(255,255,255,0.7)' : '#16a34a' }}>W</span>}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                      <button onClick={e => { e.stopPropagation(); setBewerkWinkel(w); setToonWinkelForm(false) }} className="text-xs rounded px-1 py-0.5" style={{ color: active ? 'rgba(255,255,255,0.6)' : 'rgba(13,31,78,0.4)' }}>✏️</button>
                      <button onClick={e => { e.stopPropagation(); verwijderWinkel(w.id) }} className="text-xs rounded px-1 py-0.5" style={{ color: active ? 'rgba(255,255,255,0.6)' : '#ef4444' }}>✕</button>
                    </div>
                  </div>
                )
              })}
              {winkels.length === 0 && (
                <div className="rounded-xl p-4 text-center" style={{ border: '1px dashed rgba(13,31,78,0.15)' }}>
                  <p className="text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Nog geen winkels.<br />Klik op <strong>+</strong> om toe te voegen.</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 min-w-0 p-5 space-y-6 overflow-auto">
          {!geselecteerdeWinkel ? (
            <div className="space-y-8">

              {/* HERO */}
              <div className="s1 relative rounded-2xl overflow-hidden" style={{ background: DYNAMO_BLUE, minHeight: 220 }}>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 75% 30%, rgba(240,192,64,0.12) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.04) 0%, transparent 40%)' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: DYNAMO_GOLD }} />
                <div className="relative p-8 sm:p-10">
                  <div className="inline-flex items-center gap-2 mb-5 rounded-full px-3 py-1" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: DYNAMO_GOLD }} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: DYNAMO_GOLD, fontFamily: F }}>{getDagdeel()}</span>
                  </div>
                  <h1 style={{ fontFamily: F, color: 'white', fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Voorraad Dashboard</h1>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', marginTop: '8px', fontFamily: F }}>{getDatum()}</p>
                  <div className="flex items-center gap-3 mt-6">
                    <button onClick={() => setSidebarOpen(true)} className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-sm transition-all hover:opacity-90" style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE, fontFamily: F, boxShadow: '0 4px 16px rgba(240,192,64,0.35)' }}>
                      <IconStore /> Kies een winkel
                    </button>
                    <Link href="/dashboard/brand-groep" className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-sm transition-all hover:opacity-80" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.12)', fontFamily: F }}>
                      <IconChart /> Analyse
                    </Link>
                  </div>
                  {winkels.length > 0 && (
                    <div className="flex items-center gap-6 mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      {[{ label: 'Winkels', value: winkels.length, color: 'white' }, { label: 'Locaties', value: winkels.filter(w => w.stad).length, color: 'white' }, { label: 'Favorieten', value: favorieten.length, color: DYNAMO_GOLD }].map((s, i) => (
                        <div key={s.label} className="flex items-center gap-6">
                          {i > 0 && <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }} />}
                          <div>
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                            <div style={{ color: s.color, fontSize: '22px', fontWeight: 700, fontFamily: F, lineHeight: 1.2 }}>{s.value}</div>
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="mod-card rounded-2xl overflow-hidden cursor-pointer" style={{ background: DYNAMO_BLUE, boxShadow: '0 4px 24px rgba(13,31,78,0.2)' }} onClick={() => setSidebarOpen(true)}>
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

                  <Link href="/dashboard/brand-groep" className="mod-card block rounded-2xl overflow-hidden cursor-pointer" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 4px 24px rgba(13,31,78,0.1)' }}>
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

                  <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
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
              </div>

              {/* KAART */}
              <div className="s3">
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Locaties</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: F }}>{winkels.filter(w => w.lat && w.lng).length} van {winkels.length} op kaart</span>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(13,31,78,0.08)', border: '1px solid rgba(13,31,78,0.07)' }}>
                  <WinkelKaart winkels={winkels} onSelecteer={selecteerWinkel} />
                </div>
              </div>

              {/* WINKELKAARTEN */}
              {winkels.length > 0 && (
                <div className="s4 space-y-6">
                  {favorieten.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: DYNAMO_GOLD, fontFamily: F }}>★ Mijn winkels</span>
                        <div className="flex-1 h-px" style={{ background: `${DYNAMO_GOLD}40` }} />
                        <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: F }}>{favorieten.length} favoriet{favorieten.length !== 1 ? 'en' : ''}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {winkels.filter(w => favorieten.includes(w.id)).map(w => (
                          <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[winkels.indexOf(w) % WINKEL_KLEUREN.length]} favoriet={true} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Alle winkels</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                      <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: F }}>{winkels.length} locaties</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {winkels.map((w, i) => (
                        <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]} favoriet={favorieten.includes(w.id)} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          ) : (
            <>
              <button onClick={() => setGeselecteerdeWinkel(null)} className="flex items-center gap-2 text-sm font-semibold transition hover:opacity-70" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                <IconArrowLeft /> Terug naar startscherm
              </button>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Producten', value: stats.producten, vorig: vorigeStats?.producten, color: DYNAMO_BLUE },
                  { label: 'Totaal voorraad', value: stats.voorraad, vorig: vorigeStats?.voorraad, color: DYNAMO_BLUE },
                  { label: bron === 'wilmar' ? 'Gereserveerd' : 'Fietsen op voorraad', value: bron === 'wilmar' ? gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.RESERVED) || 0), 0) : stats.fietsen, color: '#16a34a' },
                  { label: bron === 'wilmar' ? 'Verkocht' : 'Merken', value: bron === 'wilmar' ? gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.SOLD) || 0), 0) : stats.merken, color: DYNAMO_BLUE },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl px-5 py-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                    <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.08em', fontFamily: F }}>{s.label}</div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl font-bold" style={{ color: s.color, fontFamily: F, letterSpacing: '-0.03em' }}>{s.value.toLocaleString('nl-NL')}</div>
                      {trendPijl(s.value, (s as any).vorig)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Zoekbalk */}
              <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{geselecteerdeWinkel.naam}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.45)', fontFamily: F }}>#{dealer}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={bron === 'wilmar' ? { background: 'rgba(22,163,74,0.1)', color: '#16a34a', fontFamily: F } : { background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.45)', fontFamily: F }}>
                        {bron === 'wilmar' ? '🔗 Wilmar' : 'CycleSoftware'}
                      </span>
                      {geselecteerdeWinkel.stad && <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(13,31,78,0.4)' }}><IconPin />{geselecteerdeWinkel.stad}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href="/dashboard/brand-groep" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-80" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.08)', fontFamily: F }}>
                        <IconChart /> Merk/Groep
                      </Link>
                      <span className="text-xs" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>
                        {loading ? 'Laden...' : isDebouncing ? 'Wachten...' : `${gefilterdEnGesorteerd.length} resultaten`}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(13,31,78,0.3)' }}>⌕</span>
                      <input type="text" placeholder={bron === 'wilmar' ? 'Zoek op barcode...' : 'Zoek op product, merk, barcode...'} value={zoekterm} onChange={e => setZoekterm(e.target.value)} className="w-full rounded-xl px-3 py-2 pl-9 text-sm" style={inputStyle} />
                    </div>
                    <select value={zoekKolom} onChange={e => setZoekKolom(e.target.value)} className="rounded-xl px-3 py-2 text-sm" style={inputStyle}>
                      <option value="ALL">Alle kolommen</option>
                      {kolommen.map(k => <option key={k} value={k}>{columnLabel(k)}</option>)}
                    </select>
                    <div className="relative">
                      <button onClick={() => setKolomPanelOpen(v => !v)} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 flex items-center gap-2" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                        ⚙ Kolommen ({zichtbareKolommen.length})
                      </button>
                      {kolomPanelOpen && (
                        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white shadow-xl p-4 z-30" style={{ border: '1px solid rgba(13,31,78,0.1)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Kolommen</span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
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
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="overflow-auto">
                  <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        {zichtbareKolommen.map(k => {
                          const active = sortKey === k
                          const sticky = stickyEnabled && stickyKey === k
                          return (
                            <th key={k} className="px-4 py-3 text-left whitespace-nowrap" style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.7)', background: DYNAMO_BLUE, fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F, position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined, zIndex: sticky ? 60 : undefined }}>
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
                              const isRed = k === 'RESERVED'
                              const stockVal = Number(p[k])
                              return (
                                <td key={k} className="px-4 py-2.5 whitespace-nowrap align-middle" style={sticky ? { position: 'sticky', left: 0, background: 'white', zIndex: 40, boxShadow: '2px 0 0 0 rgba(13,31,78,0.06)' } : undefined}>
                                  <span className="text-sm" style={{
                                    fontFamily: F,
                                    color: isStock
                                      ? (stockVal === 0 ? '#dc2626' : stockVal <= 3 ? '#d97706' : '#16a34a')
                                      : isRed ? '#d97706'
                                      : DYNAMO_BLUE,
                                    fontWeight: (isStock || isRed) ? 600 : 400,
                                    opacity: (isStock || isRed) ? 1 : 0.8,
                                  }}>
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
    </div>
  )
}