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

const COLUMN_CONFIG: Record<
  string,
  { label?: string; hidden?: boolean; order?: number; sticky?: boolean; format?: 'money' | 'int' | 'text' }
> = {
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

function columnLabel(key: string) {
  return COLUMN_CONFIG[key]?.label ?? key.replace(/_/g, ' ')
}
function columnOrder(key: string) {
  return COLUMN_CONFIG[key]?.order ?? 1000
}
function isHidden(key: string) {
  return COLUMN_CONFIG[key]?.hidden ?? false
}
function isSticky(key: string) {
  return COLUMN_CONFIG[key]?.sticky ?? false
}

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
  return new Date().toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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
}
type Product = { [key: string]: any }
type SortDir = 'asc' | 'desc'

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
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        })
        const marker = L.marker([w.lat!, w.lng!], { icon })
        marker.addTo(map)
        marker.bindPopup(
          `<div style="font-family:sans-serif;min-width:140px">
            <div style="font-weight:bold;color:${DYNAMO_BLUE};font-size:13px">${w.naam}</div>
            <div style="color:#6b7280;font-size:11px;margin-top:2px">${w.stad || w.postcode || ''}</div>
            <button onclick="window._selectWinkel(${w.id})" style="margin-top:8px;width:100%;background:${DYNAMO_BLUE};color:white;border:none;border-radius:6px;padding:6px;font-size:12px;cursor:pointer;font-weight:bold;">Bekijk voorraad →</button>
          </div>`
        )
        bounds.push([w.lat!, w.lng!])
      })

      if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] })

      ;(window as any)._selectWinkel = (id: number) => {
        const winkel = winkels.find(w => w.id === id)
        if (winkel) onSelecteer(winkel)
      }
    }
    document.head.appendChild(script)
  }, [winkelsMetCoords.length, winkels, onSelecteer])

  if (winkelsMetCoords.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center" style={{ height: 280 }}>
        <div className="text-center text-gray-400 p-6">
          <div className="flex justify-center mb-2 opacity-40">
            <IconMap />
          </div>
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          setZichtbareKolommen(parsed)
        }
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
    setVorigeStats(prev => (items.length > 0 && prev ? prev : null))
    setProducten(items)

    const keys = items.length > 0 ? Object.keys(items[0]) : []
    const dynamicCols = keys
      .filter(k => !isHidden(k))
      .sort((a, b) => {
        const oa = columnOrder(a)
        const ob = columnOrder(b)
        return oa !== ob ? oa - ob : a.localeCompare(b)
      })

    setKolommen(dynamicCols)

    // Pas opgeslagen voorkeur toe, anders alles tonen
    setZichtbareKolommen(prev => {
      const opgeslagen = (() => {
        try {
          const s = localStorage.getItem(KOLOMMEN_STORAGE_KEY)
          return s ? JSON.parse(s) : null
        } catch {
          return null
        }
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
    setVorigeStats(
      producten.length > 0
        ? {
            producten: producten.length,
            voorraad: producten.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
          }
        : null
    )

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
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
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

  const gefilterdEnGesorteerd = useMemo(() => {
    let arr = [...producten]
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

  const stats = useMemo(
    () => ({
      producten: gefilterdEnGesorteerd.length,
      voorraad: gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
      fietsen: gefilterdEnGesorteerd
        .filter(p => isFiets(p) && Number(p.STOCK) > 0)
        .reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
      merken: new Set(gefilterdEnGesorteerd.map(p => p.BRAND_NAME)).size,
    }),
    [gefilterdEnGesorteerd]
  )

  function trendPijl(huidig: number, vorig: number | undefined) {
    if (vorig === undefined || vorig === null) return null
    if (huidig > vorig) return <span className="text-green-500 text-xs font-bold ml-1">↑</span>
    if (huidig < vorig) return <span className="text-red-400 text-xs font-bold ml-1">↓</span>
    return <span className="text-gray-400 text-xs ml-1">→</span>
  }

  const inputClass =
    'rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb' }}>
      {/* Navigatie */}
      <header style={{ background: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }} className="sticky top-0 z-30">
        <div className="px-5 flex items-stretch gap-0" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {/* Logo */}
          <div className="flex items-center gap-3 pr-6" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-base" style={{ background: DYNAMO_GOLD }}>
              <span style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>D</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight" style={{ letterSpacing: '0.06em', fontFamily: "'Outfit', sans-serif" }}>
                DYNAMO
              </div>
              <div
                className="text-xs font-semibold leading-tight"
                style={{ color: DYNAMO_GOLD, letterSpacing: '0.12em', fontFamily: "'Outfit', sans-serif", opacity: 0.9 }}
              >
                RETAIL GROUP
              </div>
            </div>
          </div>

          {/* Winkel switcher */}
          <div className="flex items-center px-5 gap-2" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <span
              className="text-xs font-semibold uppercase hidden sm:block"
              style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', fontFamily: "'Outfit', sans-serif" }}
            >
              Winkel
            </span>
            <select
              value={geselecteerdeWinkel?.id ?? ''}
              onChange={e => {
                const w = winkels.find(w => w.id === Number(e.target.value))
                if (w) selecteerWinkel(w)
              }}
              className="text-sm rounded-lg px-3 py-1.5 cursor-pointer min-w-[170px]"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.1)',
                fontFamily: "'Outfit', sans-serif",
                outline: 'none',
              }}
            >
              <option value="" disabled className="text-gray-900">
                Kies winkel...
              </option>
              {winkels.map(w => (
                <option key={w.id} value={w.id} className="text-gray-900">
                  {w.naam}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          {/* Rechts */}
          <div className="flex items-center gap-2 pl-5">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition hover:opacity-70"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <span className="flex flex-col gap-1 w-3.5">
                <span className="block h-px bg-white rounded" />
                <span className="block h-px bg-white rounded" />
                <span className="block h-px bg-white rounded" />
              </span>
            </button>

            <span className="text-xs hidden md:block px-3" style={{ color: 'rgba(255,255,255,0.35)', fontFamily: "'Outfit', sans-serif" }}>
              {gebruiker}
            </span>

            <Link
              href="/dashboard/beheer"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 hidden md:flex items-center gap-1.5"
              style={{
                background: 'rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontFamily: "'Outfit', sans-serif",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Beheer
            </Link>

            <button
              onClick={uitloggen}
              className="rounded-lg px-4 py-1.5 text-xs font-bold transition hover:opacity-90"
              style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.02em' }}
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="flex flex-col transition-all duration-200 overflow-hidden"
          style={{
            width: sidebarOpen ? '256px' : '0px',
            minWidth: sidebarOpen ? '256px' : '0px',
            background: '#f8f9fc',
            borderRight: '1px solid rgba(13,31,78,0.07)',
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          <div className={sidebarOpen ? 'flex flex-col h-full p-4 gap-3' : 'hidden'}>
            {/* Header */}
            <div className="flex items-center justify-between py-2">
              <span
                className="text-xs font-bold uppercase"
                style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.1em', fontFamily: "'Outfit', sans-serif" }}
              >
                Winkels
              </span>
              <button
                onClick={() => setToonWinkelForm(v => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-base transition hover:opacity-80"
                style={{ background: DYNAMO_BLUE }}
              >
                +
              </button>
            </div>

            {/* Nieuw winkel form */}
            {toonWinkelForm && (
              <form onSubmit={voegWinkelToe} className="rounded-xl p-3 space-y-2" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.1)' }}>
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}>
                  Nieuwe winkel
                </p>
                <input placeholder="Naam winkel" value={nieuweNaam} onChange={e => setNieuweNaam(e.target.value)} className={inputClass + ' w-full'} required />
                <input placeholder="Dealer nummer" value={nieuwDealer} onChange={e => setNieuwDealer(e.target.value)} className={inputClass + ' w-full'} required />
                <input placeholder="Postcode" value={nieuwePostcode} onChange={e => setNieuwePostcode(e.target.value)} className={inputClass + ' w-full'} />
                <input placeholder="Stad" value={nieuweStad} onChange={e => setNieuweStad(e.target.value)} className={inputClass + ' w-full'} />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={winkelLoading}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}
                  >
                    {winkelLoading ? 'Bezig...' : 'Toevoegen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setToonWinkelForm(false)}
                    className="rounded-lg border px-3 text-sm hover:bg-gray-50"
                    style={{ borderColor: 'rgba(13,31,78,0.1)' }}
                  >
                    ✕
                  </button>
                </div>
              </form>
            )}

            {/* Bewerk form */}
            {bewerkWinkel && (
              <form onSubmit={slaWinkelOp} className="rounded-xl p-3 space-y-2" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}` }}>
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}>
                  ✏️ Bewerken
                </p>
                <input
                  placeholder="Naam winkel"
                  value={bewerkWinkel.naam}
                  onChange={e => setBewerkWinkel({ ...bewerkWinkel, naam: e.target.value })}
                  className={inputClass + ' w-full'}
                  required
                />
                <input
                  placeholder="Dealer nummer"
                  value={bewerkWinkel.dealer_nummer}
                  onChange={e => setBewerkWinkel({ ...bewerkWinkel, dealer_nummer: e.target.value })}
                  className={inputClass + ' w-full'}
                  required
                />
                <input
                  placeholder="Postcode"
                  value={bewerkWinkel.postcode ?? ''}
                  onChange={e => setBewerkWinkel({ ...bewerkWinkel, postcode: e.target.value })}
                  className={inputClass + ' w-full'}
                />
                <input
                  placeholder="Stad"
                  value={bewerkWinkel.stad ?? ''}
                  onChange={e => setBewerkWinkel({ ...bewerkWinkel, stad: e.target.value })}
                  className={inputClass + ' w-full'}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={bewerkLoading}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}
                  >
                    {bewerkLoading ? 'Opslaan...' : 'Opslaan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBewerkWinkel(null)}
                    className="rounded-lg border px-3 text-sm hover:bg-gray-50"
                    style={{ borderColor: 'rgba(13,31,78,0.1)' }}
                  >
                    ✕
                  </button>
                </div>
              </form>
            )}

            {/* Winkellijst */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {winkels.map((w, i) => {
                const active = geselecteerdeWinkel?.id === w.id
                const kleur = WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]
                return (
                  <div
                    key={w.id}
                    onClick={() => selecteerWinkel(w)}
                    className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                    style={
                      active
                        ? { background: DYNAMO_BLUE, boxShadow: '0 2px 12px rgba(13,31,78,0.2)' }
                        : { background: 'white', border: '1px solid rgba(13,31,78,0.07)' }
                    }
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: active ? 'rgba(255,255,255,0.15)' : kleur }}
                    >
                      {w.naam.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-semibold truncate"
                        style={{ color: active ? 'white' : DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}
                      >
                        {w.naam}
                      </div>
                      <div className="text-xs flex items-center gap-1" style={{ color: active ? 'rgba(255,255,255,0.45)' : 'rgba(13,31,78,0.35)', fontFamily: "'Outfit', sans-serif" }}>
                        {w.stad ? (
                          <>
                            <IconPin />
                            {w.stad}
                          </>
                        ) : (
                          `#${w.dealer_nummer}`
                        )}
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setBewerkWinkel(w)
                          setToonWinkelForm(false)
                        }}
                        className="text-xs rounded px-1 py-0.5 transition"
                        style={{ color: active ? 'rgba(255,255,255,0.6)' : 'rgba(13,31,78,0.4)' }}
                        title="Bewerken"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          verwijderWinkel(w.id)
                        }}
                        className="text-xs rounded px-1 py-0.5 transition"
                        style={{ color: active ? 'rgba(255,255,255,0.6)' : '#ef4444' }}
                        title="Verwijderen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}

              {winkels.length === 0 && (
                <div className="rounded-xl p-4 text-center" style={{ border: '1px dashed rgba(13,31,78,0.15)' }}>
                  <p className="text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: "'Outfit', sans-serif" }}>
                    Nog geen winkels.
                    <br />
                    Klik op <strong>+</strong> om toe te voegen.
                  </p>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-5 space-y-4 overflow-auto">
          {!geselecteerdeWinkel ? (
            <div className="space-y-8">
              <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

                @keyframes fadeUp {
                  from { opacity: 0; transform: translateY(16px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .s1 { animation: fadeUp 0.5s ease forwards; opacity: 0; }
                .s2 { animation: fadeUp 0.5s 0.08s ease forwards; opacity: 0; }
                .s3 { animation: fadeUp 0.5s 0.16s ease forwards; opacity: 0; }
                .s4 { animation: fadeUp 0.5s 0.24s ease forwards; opacity: 0; }

                .mod-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
                .mod-card:hover { transform: translateY(-3px); box-shadow: 0 16px 48px rgba(13,31,78,0.18) !important; }

                .wink-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
                .wink-card:hover { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(13,31,78,0.14) !important; }
              `}</style>

              {/* ── HERO ── */}
              <div className="s1 relative rounded-2xl overflow-hidden" style={{ background: DYNAMO_BLUE, minHeight: 220 }}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                      'radial-gradient(circle at 75% 30%, rgba(240,192,64,0.12) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.04) 0%, transparent 40%)',
                  }}
                />
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: DYNAMO_GOLD }} />
                <div
                  className="hidden sm:block"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '280px',
                    background: 'rgba(255,255,255,0.025)',
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', opacity: 0.08 }}>
                    <svg width="100" height="100" viewBox="0 0 24 24" fill="white">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                  </div>
                </div>

                <div className="relative p-8 sm:p-10 sm:pr-72">
                  <div className="inline-flex items-center gap-2 mb-5 rounded-full px-3 py-1" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.25)' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: DYNAMO_GOLD }} />
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: DYNAMO_GOLD, fontFamily: "'Outfit', sans-serif" }}>
                      {getDagdeel()}
                    </span>
                  </div>

                  <h1 style={{ fontFamily: "'Outfit', sans-serif", color: 'white', fontSize: 'clamp(26px, 3.5vw, 42px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                    Voorraad Dashboard
                  </h1>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', marginTop: '8px', fontFamily: "'Outfit', sans-serif", fontWeight: 400, letterSpacing: '0.01em' }}>
                    {getDatum()}
                  </p>

                  <div className="flex items-center gap-3 mt-6">
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-sm transition-all hover:opacity-90"
                      style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", boxShadow: '0 4px 16px rgba(240,192,64,0.35)' }}
                    >
                      <IconStore /> Kies een winkel
                    </button>
                    <Link
                      href="/dashboard/brand-groep"
                      className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-sm transition-all hover:opacity-80"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.12)', fontFamily: "'Outfit', sans-serif" }}
                    >
                      <IconChart /> Analyse
                    </Link>
                  </div>

                  {winkels.length > 0 && (
                    <div className="flex items-center gap-6 mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Winkels
                        </div>
                        <div style={{ color: 'white', fontSize: '22px', fontWeight: 700, fontFamily: "'Outfit', sans-serif", lineHeight: 1.2 }}>{winkels.length}</div>
                      </div>
                      <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }} />
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Locaties
                        </div>
                        <div style={{ color: 'white', fontSize: '22px', fontWeight: 700, fontFamily: "'Outfit', sans-serif", lineHeight: 1.2 }}>{winkels.filter(w => w.stad).length}</div>
                      </div>
                      <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }} />
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Dealers
                        </div>
                        <div style={{ color: DYNAMO_GOLD, fontSize: '22px', fontWeight: 700, fontFamily: "'Outfit', sans-serif", lineHeight: 1.2 }}>{winkels.length}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── MODULES ── */}
              <div className="s2">
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                    Modules
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div
                    className="mod-card col-span-1 rounded-2xl overflow-hidden cursor-pointer"
                    style={{ background: DYNAMO_BLUE, boxShadow: '0 4px 24px rgba(13,31,78,0.2)' }}
                    onClick={() => setSidebarOpen(true)}
                  >
                    <div className="p-6">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(240,192,64,0.15)' }}>
                        <div style={{ color: DYNAMO_GOLD }}>
                          <IconBox />
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", color: 'white', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' }}>Voorraad</div>
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: "'Outfit', sans-serif" }}>
                        Zoek en filter producten per winkel
                      </div>
                    </div>
                    <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <span style={{ color: DYNAMO_GOLD, fontSize: '12px', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Selecteer winkel →</span>
                      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px', fontFamily: "'Outfit', sans-serif" }}>{winkels.length} locaties</span>
                    </div>
                  </div>

                  <Link
                    href="/dashboard/brand-groep"
                    className="mod-card col-span-1 block rounded-2xl overflow-hidden cursor-pointer"
                    style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 4px 24px rgba(13,31,78,0.1)' }}
                  >
                    <div className="p-6">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: DYNAMO_BLUE }}>
                        <div style={{ color: DYNAMO_GOLD }}>
                          <IconChart />
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", color: DYNAMO_BLUE, fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' }}>Merk / Groep</div>
                      <div style={{ color: 'rgba(13,31,78,0.5)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: "'Outfit', sans-serif" }}>
                        Voorraad per merk en productgroep
                      </div>
                    </div>
                    <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'rgba(13,31,78,0.03)', borderTop: `1px solid rgba(13,31,78,0.08)` }}>
                      <span style={{ color: DYNAMO_BLUE, fontSize: '12px', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Ga naar analyse →</span>
                      <div style={{ color: DYNAMO_BLUE, opacity: 0.4 }}>
                        <IconChart />
                      </div>
                    </div>
                  </Link>

                  <div className="col-span-1 rounded-2xl overflow-hidden" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
                    <div className="p-6">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ background: 'rgba(13,31,78,0.06)' }}>
                        <div style={{ color: 'rgba(13,31,78,0.25)' }}>
                          <IconMap />
                        </div>
                      </div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(13,31,78,0.35)', fontSize: '18px', fontWeight: 600, letterSpacing: '-0.02em' }}>Meer modules</div>
                      <div style={{ color: 'rgba(13,31,78,0.25)', fontSize: '13px', marginTop: '6px', lineHeight: 1.55, fontFamily: "'Outfit', sans-serif" }}>
                        Export, vergelijking, alerts
                      </div>
                    </div>
                    <div className="px-6 py-3" style={{ background: 'rgba(13,31,78,0.02)', borderTop: '1px solid rgba(13,31,78,0.05)' }}>
                      <span style={{ color: 'rgba(13,31,78,0.25)', fontSize: '12px', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Binnenkort beschikbaar</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── KAART ── */}
              <div className="s3">
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                    Locaties
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: "'Outfit', sans-serif" }}>
                    {winkels.filter(w => w.lat && w.lng).length} van {winkels.length} op kaart
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(13,31,78,0.08)', border: '1px solid rgba(13,31,78,0.07)' }}>
                  <WinkelKaart winkels={winkels} onSelecteer={selecteerWinkel} />
                </div>
              </div>

              {/* ── WINKELKAARTEN ── */}
              {winkels.length > 0 && (
                <div className="s4">
                  <div className="flex items-center gap-3 mb-4">
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                      Winkels
                    </span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(13,31,78,0.08)' }} />
                    <span style={{ fontSize: '11px', color: 'rgba(13,31,78,0.3)', fontFamily: "'Outfit', sans-serif" }}>{winkels.length} locaties</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {winkels.map((w, i) => {
                      const kleur = WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]
                      return (
                        <div
                          key={w.id}
                          onClick={() => selecteerWinkel(w)}
                          className="wink-card cursor-pointer rounded-2xl overflow-hidden bg-white"
                          style={{ boxShadow: '0 2px 12px rgba(13,31,78,0.07)', border: '1px solid rgba(13,31,78,0.07)' }}
                        >
                          <div style={{ height: '4px', background: kleur }} />

                          <div className="p-4">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: kleur }}>
                                {w.naam.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}>
                                  {w.naam}
                                </div>
                                <div style={{ color: 'rgba(13,31,78,0.35)', fontSize: '11px', fontFamily: "'Outfit', sans-serif" }}>#{w.dealer_nummer}</div>
                              </div>
                            </div>

                            {(w.stad || w.postcode) ? (
                              <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-4" style={{ background: 'rgba(13,31,78,0.04)' }}>
                                <IconPin />
                                <span style={{ color: 'rgba(13,31,78,0.5)', fontSize: '12px', fontFamily: "'Outfit', sans-serif" }}>
                                  {w.stad || ''}{w.stad && w.postcode ? ' · ' : ''}{w.postcode || ''}
                                </span>
                              </div>
                            ) : (
                              <div className="mb-4" style={{ height: '32px' }} />
                            )}

                            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(13,31,78,0.06)' }}>
                              <span style={{ color: kleur, fontSize: '12px', fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>Bekijk voorraad</span>
                              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${kleur}15` }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={kleur} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                  <polyline points="12 5 19 12 12 19" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Terugknop */}
              <button
                onClick={() => setGeselecteerdeWinkel(null)}
                className="flex items-center gap-2 text-sm font-semibold transition hover:opacity-70"
                style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}
              >
                <IconArrowLeft /> Terug naar startscherm
              </button>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Producten', value: stats.producten, vorig: vorigeStats?.producten, color: DYNAMO_BLUE, icon: '📦' },
                  { label: 'Totaal voorraad', value: stats.voorraad, vorig: vorigeStats?.voorraad, color: DYNAMO_BLUE, icon: '🏪' },
                  { label: 'Fietsen op voorraad', value: stats.fietsen, color: '#16a34a', icon: '🚲' },
                  { label: 'Merken', value: stats.merken, color: DYNAMO_BLUE, icon: '🏷️' },
                ].map(s => (
                  <div
                    key={s.label}
                    className="rounded-2xl px-5 py-4"
                    style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}
                  >
                    <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.08em', fontFamily: "'Outfit', sans-serif" }}>
                      {s.label}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl font-bold" style={{ color: s.color, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.03em' }}>
                        {s.value.toLocaleString('nl-NL')}
                      </div>
                      {trendPijl(s.value, (s as any).vorig)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Zoek + filters */}
              <div
                className="rounded-2xl p-4"
                style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)', fontFamily: "'Outfit', sans-serif" }}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}>
                        {geselecteerdeWinkel.naam}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.45)', fontFamily: "'Outfit', sans-serif" }}>
                        #{dealer}
                      </span>
                      {geselecteerdeWinkel.stad && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(13,31,78,0.4)' }}>
                          <IconPin />
                          {geselecteerdeWinkel.stad}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href="/dashboard/brand-groep"
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-80"
                        style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.08)', fontFamily: "'Outfit', sans-serif" }}
                      >
                        <IconChart /> Merk/Groep
                      </Link>

                      <span className="text-xs" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: "'Outfit', sans-serif" }}>
                        {loading ? 'Laden...' : isDebouncing ? 'Wachten...' : `${gefilterdEnGesorteerd.length} resultaten`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(13,31,78,0.3)' }}>
                        ⌕
                      </span>
                      <input
                        type="text"
                        placeholder="Zoek op product, merk, barcode..."
                        value={zoekterm}
                        onChange={e => setZoekterm(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 pl-9 text-sm"
                        style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", outline: 'none' }}
                      />
                    </div>

                    <select
                      value={zoekKolom}
                      onChange={e => setZoekKolom(e.target.value)}
                      className="rounded-xl px-3 py-2 text-sm"
                      style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif", outline: 'none' }}
                    >
                      <option value="ALL">Alle kolommen</option>
                      {kolommen.map(k => (
                        <option key={k} value={k}>
                          {columnLabel(k)}
                        </option>
                      ))}
                    </select>

                    {/* Kolommen */}
                    <div className="relative">
                      <button
                        onClick={() => setKolomPanelOpen(v => !v)}
                        className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 flex items-center gap-2"
                        style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: "'Outfit', sans-serif" }}
                      >
                        ⚙ Kolommen ({zichtbareKolommen.length})
                      </button>

                      {kolomPanelOpen && (
                        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white shadow-xl p-4 z-30" style={{ border: '1px solid rgba(13,31,78,0.1)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}>
                              Kolommen
                            </span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">
                              ✕
                            </button>
                          </div>

                          <p className="text-xs mb-3" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                            Voorkeur wordt automatisch onthouden.
                          </p>

                          <div className="flex gap-2 mb-3">
                            <button
                              onClick={() => setZichtbareKolommen([...kolommen])}
                              className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:bg-gray-50"
                              style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: "'Outfit', sans-serif" }}
                            >
                              Alles aan
                            </button>
                            <button
                              onClick={() => setZichtbareKolommen(prev => (prev.length > 1 ? [prev[0]] : prev))}
                              className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:bg-gray-50"
                              style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: "'Outfit', sans-serif" }}
                            >
                              Alles uit
                            </button>
                          </div>

                          <div className="space-y-1 max-h-64 overflow-auto">
                            {kolommen.map(k => (
                              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={zichtbareKolommen.includes(k)}
                                  onChange={() => toggleKolom(k)}
                                  disabled={zichtbareKolommen.includes(k) && zichtbareKolommen.length === 1}
                                  className="accent-blue-600"
                                />
                                <span style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}>{columnLabel(k)}</span>
                                {isSticky(k) && (
                                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                                    Vast
                                  </span>
                                )}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {(zoekterm || zoekKolom !== 'ALL') && (
                      <button
                        onClick={() => {
                          setZoekterm('')
                          setZoekKolom('ALL')
                        }}
                        className="text-sm font-semibold transition hover:opacity-70"
                        style={{ color: '#ef4444', fontFamily: "'Outfit', sans-serif" }}
                      >
                        ✕ Wis filters
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {authRequired && (
                <div className="rounded-2xl p-4 text-sm" style={{ background: '#fffbeb', border: '1px solid rgba(240,192,64,0.4)' }}>
                  <p className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}>
                    Toestemming vereist
                  </p>
                  <p className="mt-1" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: "'Outfit', sans-serif" }}>
                    {authRequired.message}
                  </p>
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
                            <th
                              key={k}
                              className="px-4 py-3 text-left whitespace-nowrap"
                              style={{
                                color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.7)',
                                background: DYNAMO_BLUE,
                                fontSize: '11px',
                                fontWeight: 600,
                                letterSpacing: '0.07em',
                                textTransform: 'uppercase',
                                fontFamily: "'Outfit', sans-serif",
                                position: sticky ? 'sticky' : undefined,
                                left: sticky ? 0 : undefined,
                                zIndex: sticky ? 60 : undefined,
                              }}
                            >
                              <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:opacity-80 transition">
                                {columnLabel(k)}
                                <span style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.25)' }}>
                                  {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                                </span>
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
                            {zichtbareKolommen.map(k => (
                              <td key={k} className="px-4 py-3">
                                <div className="h-3 rounded" style={{ background: 'rgba(13,31,78,0.06)', width: '80px' }} />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : gefilterdEnGesorteerd.length === 0 ? (
                        <tr>
                          <td colSpan={zichtbareKolommen.length} className="px-6 py-16 text-center">
                            <div className="text-3xl mb-3">🔍</div>
                            <div className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }}>
                              Geen producten gevonden
                            </div>
                            <div className="text-sm mt-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                              Probeer een andere zoekterm
                            </div>
                          </td>
                        </tr>
                      ) : (
                        gefilterdEnGesorteerd.map((p, i) => (
                          <tr
                            key={i}
                            className="transition hover:bg-blue-50/40"
                            style={{ borderBottom: '1px solid rgba(13,31,78,0.05)', background: i % 2 === 1 ? 'rgba(13,31,78,0.015)' : 'white' }}
                          >
                            {zichtbareKolommen.map(k => {
                              const sticky = stickyEnabled && stickyKey === k
                              const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                              const stockVal = Number(p[k])
                              return (
                                <td
                                  key={k}
                                  className="px-4 py-2.5 whitespace-nowrap align-middle"
                                  style={sticky ? { position: 'sticky', left: 0, background: 'white', zIndex: 40, boxShadow: '2px 0 0 0 rgba(13,31,78,0.06)' } : undefined}
                                >
                                  <span
                                    className="text-sm"
                                    style={{
                                      fontFamily: "'Outfit', sans-serif",
                                      color: isStock
                                        ? stockVal === 0
                                          ? '#dc2626'
                                          : stockVal <= 3
                                            ? '#d97706'
                                            : '#16a34a'
                                        : DYNAMO_BLUE,
                                      fontWeight: isStock ? 600 : 400,
                                      opacity: isStock ? 1 : 0.8,
                                    }}
                                  >
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
                    <span className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: "'Outfit', sans-serif" }}>
                      {gefilterdEnGesorteerd.length} producten
                    </span>
                    <span className="text-xs" style={{ color: 'rgba(13,31,78,0.3)', fontFamily: "'Outfit', sans-serif" }}>
                      Klik op kolomheader om te sorteren
                    </span>
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