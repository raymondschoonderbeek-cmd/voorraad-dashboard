'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'
const KOLOMMEN_STORAGE_KEY = 'dynamo_zichtbare_kolommen'

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
  SALES_PRICE_INC: { label: 'Prijs incl.', order: 70, format: 'money' },
  GROUP_DESCRIPTION_1: { label: 'Groep', order: 80, format: 'text' },
  GROUP_DESCRIPTION_2: { label: 'Subgroep', order: 90, format: 'text' },
  SUPPLIER_NAME: { label: 'Leverancier', order: 100, format: 'text' },
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

/* =========================
   TYPES (maar 1x!)
========================= */
type Winkel = { id: number; naam: string; dealer_nummer: string; postcode?: string; stad?: string; lat?: number; lng?: number }
type Product = { [key: string]: any }
type SortDir = 'asc' | 'desc'

/* =========================
   ICONS
========================= */
const IconBox = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconChart = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

const IconMap = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
)

const IconStore = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

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
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center" style={{ height: 280 }}>
        <div className="text-center text-gray-400 p-6">
          <div className="flex justify-center mb-2 opacity-40"><IconMap /></div>
          <p className="text-sm font-medium">Geen kaart beschikbaar</p>
          <p className="text-xs mt-1">Voeg postcodes toe aan je winkels om de kaart te zien</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 320 }}>
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

  const router = useRouter()
  const supabase = createClient()

  // Laad opgeslagen kolomvoorkeur
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

  // Sla kolomvoorkeur op als ze wijzigen
  useEffect(() => {
    if (!kolommenGeladen || zichtbareKolommen.length === 0) return
    try {
      localStorage.setItem(KOLOMMEN_STORAGE_KEY, JSON.stringify(zichtbareKolommen))
    } catch {}
  }, [zichtbareKolommen, kolommenGeladen])

  const haalWinkelsOp = useCallback(async () => {
    const res = await fetch('/api/winkels')
    const data = await res.json()
    setWinkels(data)
  }, [])

  const haalVoorraadOp = useCallback(async (dealer: string, q: string) => {
    setLoading(true)
    setAuthRequired(null)

    const res = await fetch(`/api/voorraad?dealer=${dealer}&q=${encodeURIComponent(q)}`)
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setProducten([])
      setKolommen([])
      setAuthRequired({ message: data?.message ?? 'Voorraad ophalen mislukt.' })
      setLoading(false)
      return
    }

    const items = Array.isArray(data) ? data : data.products ?? []
    setProducten(items)

    const keys = items.length > 0 ? Object.keys(items[0]) : []
    const dynamicCols = keys
      .filter(k => !isHidden(k))
      .sort((a, b) => {
        const oa = columnOrder(a), ob = columnOrder(b)
        return oa !== ob ? oa - ob : a.localeCompare(b)
      })

    setKolommen(dynamicCols)

    // Pas opgeslagen voorkeur toe, anders alles tonen
    setZichtbareKolommen(prev => {
      const opgeslagen = (() => {
        try {
          const s = localStorage.getItem(KOLOMMEN_STORAGE_KEY)
          return s ? JSON.parse(s) : null
        } catch { return null }
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
  }, [haalWinkelsOp, supabase.auth])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedZoekterm(zoekterm), 400)
    return () => clearTimeout(t)
  }, [zoekterm])

  useEffect(() => {
    if (!geselecteerdeWinkel) return
    haalVoorraadOp(geselecteerdeWinkel.dealer_nummer, debouncedZoekterm)
  }, [debouncedZoekterm, geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    setVorigeStats(producten.length > 0 ? {
      producten: producten.length,
      voorraad: producten.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    } : null)

    setGeselecteerdeWinkel(winkel)
    setZoekterm('')
    setDebouncedZoekterm('')
    setProducten([])
    setKolommen([])
    setSortKey('')
    setZoekKolom('ALL')
    setKolomPanelOpen(false)
    setAuthRequired(null)

    await haalVoorraadOp(winkel.dealer_nummer, '')
  }

  async function voegWinkelToe(e: React.FormEvent) {
    e.preventDefault()
    setWinkelLoading(true)

    await fetch('/api/winkels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: nieuweNaam, dealer_nummer: nieuwDealer, postcode: nieuwePostcode, stad: nieuweStad }),
    })

    setNieuweNaam('')
    setNieuwDealer('')
    setNieuwePostcode('')
    setNieuweStad('')
    setToonWinkelForm(false)
    setWinkelLoading(false)
    await haalWinkelsOp()
  }

  async function slaWinkelOp(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkWinkel) return

    setBewerkLoading(true)

    await fetch('/api/winkels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bewerkWinkel.id,
        naam: bewerkWinkel.naam,
        dealer_nummer: bewerkWinkel.dealer_nummer,
        postcode: bewerkWinkel.postcode,
        stad: bewerkWinkel.stad,
      }),
    })

    setBewerkLoading(false)
    setBewerkWinkel(null)
    await haalWinkelsOp()
  }

  async function verwijderWinkel(id: number) {
    if (!confirm('Winkel verwijderen?')) return
    await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })

    if (geselecteerdeWinkel?.id === id) {
      setGeselecteerdeWinkel(null)
      setProducten([])
      setKolommen([])
      setZoekterm('')
      setAuthRequired(null)
    }

    await haalWinkelsOp()
  }

  async function uitloggen() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  function toggleKolom(k: string) {
    setZichtbareKolommen(prev => {
      if (prev.includes(k)) {
        if (prev.length === 1) return prev
        return prev.filter(x => x !== k)
      }
      const set = new Set([...prev, k])
      return kolommen.filter(x => set.has(x))
    })
  }

  const isDebouncing = zoekterm !== debouncedZoekterm
  const stickyKey = kolommen.find(isSticky)
  const stickyEnabled = !!stickyKey && zichtbareKolommen.includes(stickyKey)
  const dealer = geselecteerdeWinkel?.dealer_nummer ?? ''

  // ✅ HIER: filter op voorraad >= 1 (dus geen 0/negatief)
  const gefilterdEnGesorteerd = useMemo(() => {
    // eerst: alleen voorraad >= 1
    let arr = producten.filter(p => (Number(p?.STOCK) || 0) >= 1)

    // extra lokale filter als je specifiek in 1 kolom zoekt
    if (zoekKolom !== 'ALL' && debouncedZoekterm.trim() !== '') {
      const needle = debouncedZoekterm.toLowerCase()
      arr = arr.filter(p => String(p[zoekKolom] ?? '').toLowerCase().includes(needle))
    }

    if (sortKey) {
      arr.sort((a, b) => {
        const av = asSortable(a[sortKey])
        const bv = asSortable(b[sortKey])
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return arr
  }, [producten, zoekKolom, debouncedZoekterm, sortKey, sortDir])

  const stats = useMemo(() => ({
    producten: gefilterdEnGesorteerd.length,
    voorraad: gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    fietsen: gefilterdEnGesorteerd
      .filter(p => isFiets(p) && (Number(p.STOCK) || 0) > 0)
      .reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    merken: new Set(gefilterdEnGesorteerd.map(p => p.BRAND_NAME)).size,
  }), [gefilterdEnGesorteerd])

  function trendPijl(huidig: number, vorig: number | undefined) {
    if (vorig === undefined || vorig === null) return null
    if (huidig > vorig) return <span className="text-green-500 text-xs font-bold ml-1">↑</span>
    if (huidig < vorig) return <span className="text-red-400 text-xs font-bold ml-1">↓</span>
    return <span className="text-gray-400 text-xs ml-1">→</span>
  }

  const inputClass =
    "rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb' }}>
      {/* Navigatie */}
  <header style={{ background: DYNAMO_BLUE, fontFamily: F }} className="sticky top-0 z-30">
        <div className="px-5 flex items-stretch" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3 pr-6 border-r border-white/10">
            <div style={{ background: DYNAMO_GOLD }} className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-base">
              <span style={{ color: DYNAMO_BLUE }}>D</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight tracking-wide">DYNAMO</div>
              <div style={{ color: DYNAMO_GOLD }} className="text-xs font-semibold tracking-widest leading-tight">RETAIL GROUP</div>
            </div>
          </div>

          <div className="flex items-center px-5 border-r border-white/10 gap-2">
            <span className="text-white/50 text-xs uppercase tracking-widest font-semibold hidden sm:block">Winkel</span>
            <select
              value={geselecteerdeWinkel?.id ?? ''}
              onChange={e => {
                const w = winkels.find(w => w.id === Number(e.target.value))
                if (w) selecteerWinkel(w)
              }}
              className="bg-white/10 text-white text-sm rounded-lg px-3 py-1.5 border border-white/20 focus:outline-none cursor-pointer min-w-[170px]"
            >
              <option value="" disabled className="text-gray-900">Kies winkel...</option>
              {winkels.map(w => (
                <option key={w.id} value={w.id} className="text-gray-900">{w.naam}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3 pl-5">
            <button onClick={() => setSidebarOpen(v => !v)} className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/20 hover:bg-white/10 transition">
              <span className="flex flex-col gap-1 w-4">
                <span className="block h-0.5 bg-white rounded" />
                <span className="block h-0.5 bg-white rounded" />
                <span className="block h-0.5 bg-white rounded" />
              </span>
            </button>
            <span className="text-white/60 text-xs hidden md:block truncate max-w-[160px]">👤 {gebruiker}</span>
            <Link href="/dashboard/beheer" className="rounded-lg px-3 py-2 text-xs font-semibold border border-white/20 text-white hover:bg-white/10 transition hidden md:flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Beheer
            </Link>
            <button onClick={uitloggen} className="rounded-lg px-4 py-2 text-sm font-bold transition hover:opacity-90" style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}>
              Uitloggen
            </button>
          </div>
        </div>
     <div style={{ background: DYNAMO_GOLD, height: '3px' }} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
<aside className="flex flex-col transition-all duration-200 overflow-hidden" style={{ width: sidebarOpen ? '256px' : '0px', minWidth: sidebarOpen ? '256px' : '0px', background: '#f8f9fc', borderRight: '1px solid rgba(13,31,78,0.07)', fontFamily: F }}>
          <div className={sidebarOpen ? 'flex flex-col h-full p-4 gap-3' : 'hidden'}>
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: DYNAMO_BLUE }}>Winkels</span>
              <button onClick={() => setToonWinkelForm(v => !v)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg transition hover:opacity-80" style={{ background: DYNAMO_BLUE }}>+</button>
            </div>

            {toonWinkelForm && (
              <form onSubmit={voegWinkelToe} className="rounded-xl p-3 space-y-2 border border-gray-200 bg-gray-50">
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE }}>Nieuwe winkel</p>
                <input placeholder="Naam winkel" value={nieuweNaam} onChange={e => setNieuweNaam(e.target.value)} className={inputClass + ' w-full'} required />
                <input placeholder="Dealer nummer" value={nieuwDealer} onChange={e => setNieuwDealer(e.target.value)} className={inputClass + ' w-full'} required />
                <input placeholder="Postcode (bijv. 1234AB)" value={nieuwePostcode} onChange={e => setNieuwePostcode(e.target.value)} className={inputClass + ' w-full'} />
                <input placeholder="Stad" value={nieuweStad} onChange={e => setNieuweStad(e.target.value)} className={inputClass + ' w-full'} />
                <div className="flex gap-2">
                  <button type="submit" disabled={winkelLoading} className="flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE }}>
                    {winkelLoading ? 'Bezig...' : 'Toevoegen'}
                  </button>
                  <button type="button" onClick={() => setToonWinkelForm(false)} className="rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50">✕</button>
                </div>
              </form>
            )}

            {bewerkWinkel && (
              <form onSubmit={slaWinkelOp} className="rounded-xl p-3 space-y-2 border-2 bg-gray-50" style={{ borderColor: DYNAMO_BLUE }}>
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE }}>✏️ Winkel bewerken</p>
                <input placeholder="Naam winkel" value={bewerkWinkel.naam} onChange={e => setBewerkWinkel({ ...bewerkWinkel, naam: e.target.value })} className={inputClass + ' w-full'} required />
                <input placeholder="Dealer nummer" value={bewerkWinkel.dealer_nummer} onChange={e => setBewerkWinkel({ ...bewerkWinkel, dealer_nummer: e.target.value })} className={inputClass + ' w-full'} required />
                <input placeholder="Postcode (bijv. 1234AB)" value={bewerkWinkel.postcode ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, postcode: e.target.value })} className={inputClass + ' w-full'} />
                <input placeholder="Stad" value={bewerkWinkel.stad ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, stad: e.target.value })} className={inputClass + ' w-full'} />
                <div className="flex gap-2">
                  <button type="submit" disabled={bewerkLoading} className="flex-1 rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE }}>
                    {bewerkLoading ? 'Opslaan...' : 'Opslaan'}
                  </button>
                  <button type="button" onClick={() => setBewerkWinkel(null)} className="rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50">✕</button>
                </div>
              </form>
            )}

            <div className="flex-1 overflow-y-auto space-y-1">
              {winkels.map((w, i) => {
                const active = geselecteerdeWinkel?.id === w.id
                const kleur = WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]
                return (
                  <div key={w.id} onClick={() => selecteerWinkel(w)} className="group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition border" style={active ? { background: DYNAMO_BLUE, borderColor: DYNAMO_BLUE } : { background: 'white', borderColor: '#e5e7eb' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: active ? 'rgba(255,255,255,0.2)' : kleur }}>
                      {w.naam.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: active ? 'white' : DYNAMO_BLUE }}>{w.naam}</div>
                      <div className="text-xs flex items-center gap-1" style={{ color: active ? 'rgba(255,255,255,0.6)' : '#9ca3af' }}>
                        {w.stad ? <><IconPin />{w.stad}</> : `#${w.dealer_nummer}`}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                      <button onClick={e => { e.stopPropagation(); setBewerkWinkel(w); setToonWinkelForm(false) }} className="text-xs rounded px-1.5 py-0.5 hover:bg-white/20" style={{ color: active ? 'white' : DYNAMO_BLUE }} title="Bewerken">✏️</button>
                      <button onClick={e => { e.stopPropagation(); verwijderWinkel(w.id) }} className="text-xs rounded px-1.5 py-0.5 hover:bg-white/20" style={{ color: active ? 'white' : '#ef4444' }} title="Verwijderen">✕</button>
                    </div>
                  </div>
                )
              })}
              {winkels.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-400 text-center">
                  Nog geen winkels.<br />Klik op <strong>+</strong> om toe te voegen.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-5 space-y-4 overflow-auto">
          {!geselecteerdeWinkel ? (
            <div className="space-y-5">
              <div className="rounded-2xl overflow-hidden shadow-sm relative" style={{ background: DYNAMO_BLUE, minHeight: 200 }}>
                <div className="absolute -top-12 -right-12 w-72 h-72 rounded-full opacity-10" style={{ background: DYNAMO_GOLD }} />
                <div className="absolute top-8 right-8 w-32 h-32 rounded-full opacity-5" style={{ background: 'white' }} />
                <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full opacity-5" style={{ background: 'white' }} />
                <div className="relative p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                  <div>
                    <div style={{ color: DYNAMO_GOLD }} className="text-sm font-bold uppercase tracking-widest mb-1">{getDagdeel()}</div>
                    <h1 className="text-white text-2xl sm:text-3xl font-black leading-tight">Voorraad Dashboard</h1>
                    <p className="mt-1 text-white/60 text-sm capitalize">{getDatum()}</p>
                    <p className="mt-3 text-white/70 text-sm max-w-md">Selecteer een winkel om de voorraad te bekijken en te doorzoeken.</p>
                    <button onClick={() => setSidebarOpen(true)} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2" style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}>
                      <IconStore /> Kies een winkel
                    </button>
                  </div>
                  <div className="hidden sm:flex items-center justify-center opacity-10" style={{ color: 'white' }}>
                    <svg width="120" height="120" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: DYNAMO_BLUE }}>Modules</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="rounded-2xl border-2 overflow-hidden shadow-sm cursor-pointer transition hover:shadow-lg hover:-translate-y-1 duration-200" style={{ borderColor: DYNAMO_BLUE }} onClick={() => setSidebarOpen(true)}>
                    <div className="p-5" style={{ background: DYNAMO_BLUE }}>
                      <div className="text-white mb-3"><IconBox /></div>
                      <div className="text-white font-bold text-lg">Voorraad</div>
                      <div className="text-white/60 text-sm mt-1">Doorzoek en filter de volledige voorraad per winkel</div>
                    </div>
                    <div className="px-5 py-3 bg-white flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: DYNAMO_BLUE }}>Kies een winkel →</span>
                      <span className="text-xs text-gray-400">{winkels.length} winkels</span>
                    </div>
                  </div>

                  <Link href="/dashboard/brand-groep" className="rounded-2xl border-2 overflow-hidden shadow-sm cursor-pointer transition hover:shadow-lg hover:-translate-y-1 duration-200 block" style={{ borderColor: DYNAMO_GOLD }}>
                    <div className="p-5" style={{ background: 'linear-gradient(135deg, #0d1f4e 60%, #162d5e)' }}>
                      <div className="text-white mb-3"><IconChart /></div>
                      <div className="text-white font-bold text-lg">Merk / Groep</div>
                      <div className="text-white/60 text-sm mt-1">Bekijk beschikbare voorraad per merk en productgroep</div>
                    </div>
                    <div className="px-5 py-3 bg-white flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: DYNAMO_BLUE }}>Ga naar overzicht →</span>
                      <div style={{ color: DYNAMO_GOLD }}><IconChart /></div>
                    </div>
                  </Link>

                  <div className="rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden shadow-sm opacity-50">
                    <div className="p-5 bg-gray-50">
                      <div className="text-gray-400 mb-3"><IconMap /></div>
                      <div className="text-gray-500 font-bold text-lg">Meer komt eraan</div>
                      <div className="text-gray-400 text-sm mt-1">Export, vergelijk winkels, lage voorraad alerts en meer</div>
                    </div>
                    <div className="px-5 py-3 bg-white">
                      <span className="text-xs font-semibold text-gray-400">Binnenkort beschikbaar</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: DYNAMO_BLUE }}>Winkels op de kaart</h2>
                <WinkelKaart winkels={winkels} onSelecteer={selecteerWinkel} />
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => setGeselecteerdeWinkel(null)} className="flex items-center gap-2 text-sm font-semibold hover:underline transition" style={{ color: DYNAMO_BLUE }}>
                <IconArrowLeft /> Terug naar startscherm
              </button>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Producten', value: stats.producten, vorig: vorigeStats?.producten, color: DYNAMO_BLUE },
                  { label: 'Totaal voorraad', value: stats.voorraad, vorig: vorigeStats?.voorraad, color: DYNAMO_BLUE },
                  { label: 'Fietsen op voorraad', value: stats.fietsen, color: '#16a34a' },
                  { label: 'Merken', value: stats.merken, color: DYNAMO_BLUE },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</div>
                    <div className="flex items-baseline mt-0.5">
                      <div className="text-2xl font-black" style={{ color: s.color }}>{s.value.toLocaleString('nl-NL')}</div>
                      {trendPijl(s.value, (s as any).vorig)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE }}>{geselecteerdeWinkel.naam}</span>
                      <span className="text-gray-400 text-sm">#{dealer}</span>
                      {geselecteerdeWinkel.stad && <span className="flex items-center gap-1 text-xs text-gray-400"><IconPin />{geselecteerdeWinkel.stad}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href="/dashboard/brand-groep" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold border transition hover:shadow-sm" style={{ borderColor: DYNAMO_GOLD, color: DYNAMO_BLUE, background: '#fffbeb' }}>
                        <IconChart /> Merk/Groep
                      </Link>
                      <span className="text-xs text-gray-400">
                        {loading ? 'Laden...' : isDebouncing ? 'Wachten...' : `${gefilterdEnGesorteerd.length} resultaten`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
                      <input type="text" placeholder="Zoek op product, merk, barcode..." value={zoekterm} onChange={e => setZoekterm(e.target.value)} className={inputClass + ' w-full pl-9'} />
                    </div>

                    <select value={zoekKolom} onChange={e => setZoekKolom(e.target.value)} className={inputClass}>
                      <option value="ALL">Alle kolommen</option>
                      {kolommen.map(k => <option key={k} value={k}>{columnLabel(k)}</option>)}
                    </select>

                    <div className="relative">
                      <button onClick={() => setKolomPanelOpen(v => !v)} className="rounded-lg px-4 py-2 text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-50 flex items-center gap-2" style={{ color: DYNAMO_BLUE }}>
                        ⚙ Kolommen ({zichtbareKolommen.length})
                      </button>
                      {kolomPanelOpen && (
                        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-gray-200 bg-white shadow-xl p-4 z-30">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>Kolommen instellen</span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
                          </div>
                          <p className="text-xs text-gray-400 mb-3">Jouw voorkeur wordt automatisch onthouden.</p>
                          <div className="flex gap-2 mb-3">
                            <button onClick={() => setZichtbareKolommen([...kolommen])} className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold hover:bg-gray-50">Alles aan</button>
                            <button onClick={() => setZichtbareKolommen(prev => prev.length > 1 ? [prev[0]] : prev)} className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold hover:bg-gray-50">Alles uit</button>
                          </div>
                          <div className="space-y-2 max-h-64 overflow-auto">
                            {kolommen.map(k => (
                              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1">
                                <input type="checkbox" checked={zichtbareKolommen.includes(k)} onChange={() => toggleKolom(k)} disabled={zichtbareKolommen.includes(k) && zichtbareKolommen.length === 1} className="accent-blue-600" />
                                <span className="text-gray-800">{columnLabel(k)}</span>
                                {isSticky(k) && <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Vast</span>}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {(zoekterm || zoekKolom !== 'ALL') && (
                      <button onClick={() => { setZoekterm(''); setZoekKolom('ALL') }} className="text-sm text-red-400 hover:text-red-600 font-medium">✕ Wis filters</button>
                    )}
                  </div>
                </div>
              </div>

              {authRequired && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Toestemming vereist</p>
                  <p className="mt-1">{authRequired.message}</p>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-auto">
                  <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        {zichtbareKolommen.map(k => {
                          const active = sortKey === k
                          const sticky = stickyEnabled && stickyKey === k
                          return (
                            <th key={k} className="px-4 py-3 text-left whitespace-nowrap text-xs font-bold uppercase tracking-wide" style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.85)', background: DYNAMO_BLUE, position: sticky ? 'sticky' : undefined, left: sticky ? 0 : undefined, zIndex: sticky ? 60 : undefined }}>
                              <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:opacity-80 transition">
                                {columnLabel(k)}
                                <span style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.3)' }}>{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                              </button>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {loading ? (
                        Array.from({ length: 12 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            {zichtbareKolommen.map(k => (
                              <td key={k} className="px-4 py-3"><div className="h-3 bg-gray-200 rounded w-24" /></td>
                            ))}
                          </tr>
                        ))
                      ) : gefilterdEnGesorteerd.length === 0 ? (
                        <tr>
                          <td colSpan={zichtbareKolommen.length} className="px-6 py-12 text-center">
                            <div className="text-4xl mb-2">🔍</div>
                            <div className="font-semibold text-gray-700">Geen producten gevonden</div>
                            <div className="text-sm text-gray-400 mt-1">Let op: we tonen alleen voorraad ≥ 1</div>
                          </td>
                        </tr>
                      ) : (
                        gefilterdEnGesorteerd.map((p, i) => (
                          <tr key={i} className="transition hover:bg-yellow-50" style={i % 2 === 1 ? { background: '#fafafa' } : {}}>
                            {zichtbareKolommen.map(k => {
                              const sticky = stickyEnabled && stickyKey === k
                              const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                              const stockVal = Number(p[k])
                              return (
                                <td key={k} className="px-4 py-2.5 whitespace-nowrap align-middle" style={sticky ? { position: 'sticky', left: 0, background: 'white', zIndex: 40, boxShadow: '2px 0 0 0 rgba(229,231,235,1)' } : undefined}>
                                  <span className={isStock ? (stockVal <= 3 ? 'text-amber-600 font-semibold' : 'text-green-600 font-semibold') : 'text-gray-800'}>
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                    <span>{gefilterdEnGesorteerd.length} producten (voorraad ≥ 1)</span>
                    <span>Klik op een kolomheader om te sorteren</span>
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