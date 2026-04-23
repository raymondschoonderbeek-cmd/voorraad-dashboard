'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BrancheNieuwsModule, BRANCHE_NIEUWS_MEER_URL } from '@/components/BrancheNieuws'
import useSWR from 'swr'
import { WinkelModal } from '@/components/WinkelModal'
import { DYNAMO_BLUE, DYNAMO_GOLD, DYNAMO_LOGO, dashboardModuleTile, dashboardUi } from '@/lib/theme'
import { IconBox, IconChart, IconMap, IconGrip, IconLunch, IconBike, IconNewspaper, IconLaptop, IconArrowLeft, IconPin } from '@/components/DashboardIcons'
import type { Winkel } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const KOLOMMEN_STORAGE_KEY = 'dynamo_zichtbare_kolommen'
const WINKEL_STORAGE_KEY = 'dynamo_geselecteerde_winkel_id'
const F = "'Outfit', sans-serif"

const DEFAULT_MODULE_ORDER = ['voorraad', 'lunch', 'brand-groep', 'campagne-fietsen', 'branche-nieuws', 'interne-nieuws', 'it-cmdb', 'beschikbaarheid', 'winkels', 'meer'] as const
type ModuleId = (typeof DEFAULT_MODULE_ORDER)[number]


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
  const [foutmelding, setFoutmelding] = useState<null | { message: string; type: 'auth' | 'netwerk' | 'server' }>(null)
  const [weergave, setWeergave] = useState<'tabel' | 'kaarten'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'kaarten' : 'tabel'
  )
  const [vorigeStats, setVorigeStats] = useState<{ producten: number; voorraad: number } | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const { data: favorietenData } = useSWR<{ winkel_ids: number[] }>('/api/favorieten', fetcher)
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

  type RuimteItem = { id: string; naam: string; bezet: boolean; tot?: string; capacity: number; boekingen: { van: string; tot: string }[] }
  const { data: ruimtesData } = useSWR<RuimteItem[]>('/api/ruimtes', fetcher, {
    refreshInterval: 60_000,
    shouldRetryOnError: false,
  })

  type OofCollega = { user_id: string; naam: string | null; afdeling: string | null; next_available_label: string | null }
  const { data: beschikbaarheidData } = useSWR<{ statussen: (OofCollega & { status: string })[] }>(
    '/api/beschikbaarheid/status',
    fetcher,
    { refreshInterval: 5 * 60_000, shouldRetryOnError: false }
  )
  const oofCollega = (beschikbaarheidData?.statussen ?? []).filter(s => s.status === 'out-of-office')
  const savedOrder = profileData?.modules_order
  const [moduleOrder, setModuleOrder] = useState<ModuleId[]>(() => [...DEFAULT_MODULE_ORDER])
  useEffect(() => {
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return
    const valid = savedOrder.filter((id): id is ModuleId => DEFAULT_MODULE_ORDER.includes(id as ModuleId))
    const missing = DEFAULT_MODULE_ORDER.filter(id => !valid.includes(id))
    const next = valid.length ? [...valid, ...missing] : [...DEFAULT_MODULE_ORDER]
    setModuleOrder(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [savedOrder])
  const [temperatuur, setTemperatuur] = useState<number | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()


  // Herstel geselecteerde winkel uit URL (?winkel=ID); open modal bij ?kies-winkel=1
  useEffect(() => {
    if (winkelsVoorGebruiker.length === 0) return
    if (sessionData === undefined) return
    if (lunchOnly) {
      if (searchParams.get('winkel')) router.replace('/dashboard')
      setGeselecteerdeWinkel(null)
      return
    }
    if (searchParams.get('kies-winkel')) {
      router.replace('/dashboard')
      setWinkelModalOpen(true)
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
    setFoutmelding(null)
    const params = new URLSearchParams()
    if (winkelId) params.set('winkel', String(winkelId))
    if (dealer) params.set('dealer', dealer)

    let res: Response
    try {
      res = await fetch(`/api/voorraad?${params.toString()}`)
    } catch {
      setProducten([]); setKolommen([])
      setFoutmelding({ message: 'Verbinding mislukt. Controleer je internetverbinding en probeer opnieuw.', type: 'netwerk' })
      setLoading(false)
      return
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setProducten([]); setKolommen([])
      const type = res.status === 401 || res.status === 403 ? 'auth' : 'server'
      setFoutmelding({ message: data?.message ?? 'Voorraad ophalen mislukt.', type })
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
    router.replace(`/dashboard?winkel=${winkel.id}`)
    setZoekterm(''); setProducten([]); setKolommen([])
    setSortKey(''); setZoekKolom('ALL'); setKolomPanelOpen(false); setFoutmelding(null)
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

  const rowVirtualizer = useVirtualizer({
    count: loading ? 0 : gefilterdEnGesorteerd.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 42,
    overscan: 8,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalVirtualSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length > 0 ? totalVirtualSize - virtualRows[virtualRows.length - 1].end : 0

  function trendPijl(huidig: number, vorig: number | undefined) {
    if (vorig === undefined || vorig === null) return null
    if (huidig > vorig) return <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 700, marginLeft: '2px' }}>↑</span>
    if (huidig < vorig) return <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700, marginLeft: '2px' }}>↓</span>
    return <span style={{ color: 'rgba(45,69,124,0.3)', fontSize: '12px', marginLeft: '2px' }}>→</span>
  }

  const inputStyle = { background: 'rgba(45,69,124,0.05)', border: `1px solid ${dashboardUi.borderSoft}`, color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }

  return (
    <div style={{ background: 'var(--drg-page-bg)', fontFamily: F, minHeight: '100%' }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        .s1{animation:fadeUp .5s ease forwards;opacity:0}
        .s2{animation:fadeUp .5s .08s ease forwards;opacity:0}
        .s3{animation:fadeUp .5s .16s ease forwards;opacity:0}
        .mod-card{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
        .mod-card:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(45,69,124,.10)!important}
        .mod-card:focus-visible{outline:2px solid rgba(45,69,124,.35);outline-offset:3px}
        .wink-card{transition:transform .2s ease,box-shadow .2s ease}
        .wink-card:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(45,69,124,.12)!important}
      `}</style>

      <WinkelModal
        open={winkelModalOpen}
        onClose={() => setWinkelModalOpen(false)}
        winkels={winkelsVoorGebruiker}
        onSelect={selecteerWinkel}
        loading={winkelModalOpen && winkelsLoading}
      />

      <div style={{ padding: '24px 28px', boxSizing: 'border-box' }}>
          {!geselecteerdeWinkel ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Pagina-kop */}
              <section className="s1" aria-labelledby="dashboard-heading-welcome">
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--drg-section-label)', fontFamily: F, margin: 0 }}>
                  {getDatum()}
                </p>
                <h1 id="dashboard-heading-welcome" style={{ fontFamily: F, color: 'var(--drg-ink-2)', fontSize: 'clamp(22px, 2.5vw, 28px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.2, margin: '4px 0 0' }}>
                  Home — overzicht
                </h1>
                {!lunchOnly && !winkelsLoading && winkelsVoorGebruiker.length === 0 && (
                  <p style={{ marginTop: 8, maxWidth: 480, borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.6, background: 'rgba(45,69,124,0.05)', color: 'var(--drg-text-muted)', fontFamily: F, border: '1px solid var(--drg-divider)' }}>
                    Er zijn nog geen winkels gekoppeld aan jouw account.{isAdmin ? <> <Link href="/dashboard/beheer" style={{ color: DYNAMO_BLUE, fontWeight: 600 }}>Open Beheer</Link> om winkels te koppelen.</> : ' Neem contact op met een beheerder.'}
                  </p>
                )}
              </section>

              {/* Stat-rij */}
              {!lunchOnly && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }} className="s1">
                  {[
                    { label: 'Winkels', value: winkelsLoading ? '…' : winkelsVoorGebruiker.length, sub: 'vestigingen', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg> },
                    { label: 'Ongelezen nieuws', value: newsUnreadData?.count ?? 0, sub: 'berichten', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                    { label: 'Actieve modules', value: sessionData === undefined ? '…' : orderedModules.length, sub: 'beschikbaar', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
                    { label: 'Favorieten', value: winkelsLoading ? '…' : favorieten.length, sub: 'winkels', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, padding: '18px 20px', boxShadow: 'var(--drg-card-shadow)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--drg-section-label)', fontFamily: F }}>{s.label}</span>
                        <span style={{ color: 'var(--drg-section-label)' }}>{s.icon}</span>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--drg-ink-2)', fontFamily: F, lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: 'var(--drg-section-label)', fontFamily: F }}>{s.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ruimtes vandaag */}
              {ruimtesData && ruimtesData.length > 0 && (
                <section className="s2" aria-label="Ruimtes vandaag">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <h2 style={{ fontFamily: F, fontSize: 13, fontWeight: 700, color: 'var(--drg-ink-2)', margin: 0, letterSpacing: '-0.01em' }}>Ruimtes vandaag</h2>
                    <div style={{ flex: 1, height: 1, background: 'var(--drg-line)' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {ruimtesData.map(r => (
                      <div key={r.id} style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, padding: '12px 14px', boxShadow: 'var(--drg-card-shadow)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Naam + status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: r.bezet ? 'var(--drg-danger)' : 'var(--drg-success)' }} />
                          <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: 'var(--drg-ink-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.naam}</span>
                          <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, flexShrink: 0, color: r.bezet ? 'var(--drg-danger)' : 'var(--drg-success)' }}>
                            {r.bezet ? `bezet t/m ${r.tot}` : r.boekingen.length === 0 ? 'vrij vandaag' : `vrij tot ${r.boekingen[0].van}`}
                          </span>
                        </div>
                        {/* Komende tijdslots */}
                        {r.boekingen.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.boekingen.map((b, i) => (
                              <span key={i} style={{ fontFamily: F, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: 'rgba(45,69,124,0.07)', border: '1px solid rgba(45,69,124,0.12)', color: 'var(--drg-ink-2)', whiteSpace: 'nowrap' }}>
                                {b.van}–{b.tot}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Afwezig vandaag */}
              {oofCollega.length > 0 && (
                <section className="s2" aria-label="Afwezig vandaag">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <h2 style={{ fontFamily: F, fontSize: 13, fontWeight: 700, color: 'var(--drg-ink-2)', margin: 0, letterSpacing: '-0.01em' }}>Afwezig vandaag</h2>
                    <div style={{ flex: 1, height: 1, background: 'var(--drg-line)' }} />
                    <Link href="/dashboard/beschikbaarheid" style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: 'var(--drg-ink-2)', textDecoration: 'none', opacity: 0.6 }}>
                      Alle collega&apos;s →
                    </Link>
                  </div>
                  <div style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10, boxShadow: 'var(--drg-card-shadow)', overflow: 'hidden' }}>
                    {oofCollega.map((g, i) => {
                      const initialen = (g.naam ?? '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
                      const isLast = i === oofCollega.length - 1
                      return (
                        <div key={g.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: isLast ? 'none' : '1px solid var(--drg-line)' }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(45,69,124,0.1)', color: 'var(--drg-ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, fontFamily: F }}>
                            {initialen}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: 'var(--drg-ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {g.naam ?? '—'}
                            </div>
                            {g.afdeling && (
                              <div style={{ fontFamily: F, fontSize: 11, color: 'var(--drg-text-3)', marginTop: 1 }}>{g.afdeling}</div>
                            )}
                          </div>
                          {g.next_available_label && (
                            <span style={{ fontFamily: F, fontSize: 11, fontWeight: 500, color: 'var(--drg-text-3)', flexShrink: 0 }}>
                              {g.next_available_label}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* MODULES */}
              <section className="s2" aria-labelledby="dashboard-heading-modules">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <h2 id="dashboard-heading-modules" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--drg-section-label)', fontFamily: F, margin: 0 }}>{lunchOnly ? 'Modules' : 'Jouw modules'}</h2>
                  <div style={{ flex: 1, height: 1, background: 'var(--drg-divider)' }} aria-hidden />
                  {!lunchOnly && (
                    <p id="dashboard-modules-hint" style={{ fontSize: 11, color: 'var(--drg-section-label)', fontFamily: F, margin: 0, whiteSpace: 'nowrap' }}>
                      Sleep om volgorde aan te passen
                    </p>
                  )}
                </div>
                {sessionData === undefined ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} aria-busy="true" aria-label="Modules laden">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="overflow-hidden animate-pulse" style={{ minHeight: 170, background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', borderRadius: 10 }}>
                        <div className="p-6">
                          <div className="w-10 h-10 rounded-xl mb-5" style={{ background: 'rgba(45,69,124,0.08)' }} />
                          <div className="h-4 rounded mb-2" style={{ background: 'rgba(45,69,124,0.08)', width: '55%' }} />
                          <div className="h-3 rounded" style={{ background: 'rgba(45,69,124,0.05)', width: '80%' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : sessionData !== undefined && orderedModules.length === 0 ? (
                  <div style={{ borderRadius: 10, border: '1px dashed rgba(45,69,124,0.22)', padding: '32px 20px', textAlign: 'center', background: 'var(--drg-card-bg)' }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: DYNAMO_BLUE, fontFamily: F }}>Geen modules ingeschakeld</p>
                    <p style={{ marginTop: 8, fontSize: 13, color: 'var(--drg-text-muted)', fontFamily: F }}>
                      Vraag een beheerder om modules te activeren.
                    </p>
                    {isAdmin && (
                      <Link href="/dashboard/beheer" style={{ display: 'inline-flex', marginTop: 16, padding: '8px 16px', borderRadius: 8, background: DYNAMO_BLUE, color: 'white', fontSize: 13, fontWeight: 600, fontFamily: F, textDecoration: 'none' }}>
                        Naar Beheer
                      </Link>
                    )}
                  </div>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {orderedModules.map((id, idx) => {
                    const isFirst = idx === 0
                    const modCardMax = 'max-h-[270px]'
                    const modCard = `mod-card overflow-hidden ${modCardMax}`
                    const tileSurface = { background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)', borderRadius: 10 } as const
                    const tileIconWrap = { background: 'rgba(45,69,124,0.07)' } as const
                    const tileFooter = { background: 'rgba(45,69,124,0.03)', borderTop: '1px solid var(--drg-divider)' } as const
                    const modTitleStyle = { fontFamily: F, color: 'var(--drg-ink-2)', fontSize: '15px', fontWeight: 600, letterSpacing: '-0.01em' } as const
                    const modSubStyle = { color: 'var(--drg-text-muted)', fontSize: '12px', marginTop: 6, lineHeight: 1.55, fontFamily: F } as const
                    const modFooterLink = { color: DYNAMO_BLUE, fontSize: '12px', fontWeight: 600, fontFamily: F } as const
                    const modFooterIcon = { color: 'rgba(45,69,124,0.3)' } as const
                    const colSpan = isFirst ? { gridColumn: 'span 2' } : {}
                    const dragHandle = !lunchOnly ? (
                      <div
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; e.stopPropagation() }}
                        onDragOver={e => e.preventDefault()}
                        onClick={e => { e.preventDefault(); e.stopPropagation() }}
                        className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center cursor-grab active:cursor-grabbing opacity-50 hover:opacity-90 transition-opacity"
                        style={{ background: 'rgba(45,69,124,0.07)', color: 'rgba(45,69,124,0.5)' }}
                        title="Sleep om volgorde te wijzigen"
                        aria-label={`Verslepen: module ${id.replace(/-/g, ' ')}`}
                        aria-describedby="dashboard-modules-hint"
                      >
                        <IconGrip />
                      </div>
                    ) : null
                    if (id === 'voorraad') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div
                            className={`${modCard} cursor-pointer flex flex-col h-full`}
                            style={{ ...tileSurface }}
                            onClick={openWinkelSelect}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWinkelSelect() } }}
                            role="button"
                            tabIndex={0}
                            aria-label="Voorraad: kies een winkel om producten te bekijken"
                          >
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }}><IconBox /></div>
                              </div>
                              <div style={modTitleStyle}>Voorraad</div>
                              <div style={modSubStyle}>Zoek en filter producten per winkel</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Selecteer winkel →</span>
                              <span style={{ color: 'var(--drg-text-muted)', fontSize: '12px', fontFamily: F }}>{winkelsVoorGebruiker.length} locaties</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (id === 'lunch') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/lunch" aria-label="Module Lunch bestellen: broodjes bestellen voor op kantoor" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }}><IconLunch /></div>
                              </div>
                              <div style={modTitleStyle}>Lunch bestellen</div>
                              <div style={modSubStyle}>Bestel broodjes voor op kantoor</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Bestellen →</span>
                              <div style={modFooterIcon}><IconLunch /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'brand-groep') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/brand-groep" aria-label="Module Merk en groep: voorraadanalyse per merk" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }}><IconChart /></div>
                              </div>
                              <div style={modTitleStyle}>Merk / Groep</div>
                              <div style={modSubStyle}>Voorraad per merk en productgroep</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Ga naar analyse →</span>
                              <div style={modFooterIcon}><IconChart /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'campagne-fietsen') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/campagne-fietsen" aria-label="Module Campagnefietsen: landelijk voorraadoverzicht" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }}><IconBike /></div>
                              </div>
                              <div style={modTitleStyle}>Campagnefietsen</div>
                              <div style={modSubStyle}>Landelijk voorraad per campagnefiets</div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Bekijk overzicht →</span>
                              <div style={modFooterIcon}><IconBike /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'branche-nieuws') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div
                            className={`${modCard} h-full flex flex-col`}
                            style={{ ...tileSurface }}
                          >
                            {dragHandle}
                            <div className="p-6 flex-1 flex flex-col min-h-0">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5 shrink-0" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }} aria-hidden><IconNewspaper /></div>
                              </div>
                              <div style={modTitleStyle}>Branche nieuws</div>
                              <div style={modSubStyle}>
                                Actuele artikelen van NieuwsFiets
                              </div>
                              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5 -mr-0.5">
                                <BrancheNieuwsModule maxItems={3} compact />
                              </div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto shrink-0" style={{ ...tileFooter }}>
                              <a
                                href={BRANCHE_NIEUWS_MEER_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-left"
                                style={modFooterLink}
                                onClick={e => e.stopPropagation()}
                              >
                                Meer nieuws →
                              </a>
                              <div style={modFooterIcon} aria-hidden><IconNewspaper /></div>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (id === 'interne-nieuws') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/nieuws/beheer" aria-label="Intern nieuws: berichten beheren" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }} aria-hidden><IconNewspaper /></div>
                              </div>
                              <div style={modTitleStyle}>Intern nieuws</div>
                              <div style={modSubStyle}>
                                Plaats en beheer mededelingen voor het team
                              </div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Naar beheer →</span>
                              <div style={modFooterIcon} aria-hidden><IconNewspaper /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'it-cmdb') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/it-cmdb" aria-label="IT-hardware CMDB: interne voorraad" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }} aria-hidden><IconLaptop /></div>
                              </div>
                              <div style={modTitleStyle}>IT-hardware</div>
                              <div style={modSubStyle}>
                                CMDB: laptops, serienummers, Intune, locatie
                              </div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Open overzicht →</span>
                              <div style={modFooterIcon} aria-hidden><IconLaptop /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'beschikbaarheid') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/beschikbaarheid" aria-label="Beschikbaarheid team" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }} aria-hidden>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><circle cx="19" cy="3" r="2" fill="#4ade80" stroke="none"/></svg>
                                </div>
                              </div>
                              <div style={modTitleStyle}>Beschikbaarheid</div>
                              <div style={modSubStyle}>
                                Wie is er vandaag? OOF & werktijden per collega
                              </div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Open overzicht →</span>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(45,69,124,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'winkels') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <Link href="/dashboard/winkels" aria-label="Winkels & vestigingen" className={`${modCard} block cursor-pointer flex flex-col h-full`} style={{ ...tileSurface }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }} aria-hidden><IconMap /></div>
                              </div>
                              <div style={modTitleStyle}>Winkels</div>
                              <div style={modSubStyle}>
                                Vestigingen, kaart & favorieten
                              </div>
                            </div>
                            <div className="px-6 py-3 flex items-center justify-between mt-auto" style={{ ...tileFooter }}>
                              <span style={modFooterLink}>Open overzicht →</span>
                              <div style={modFooterIcon} aria-hidden><IconMap /></div>
                            </div>
                          </Link>
                        </div>
                      )
                    }
                    if (id === 'meer') {
                      return (
                        <div key={id} className="relative h-full" style={colSpan} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }} onDrop={e => { e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!Number.isNaN(from) && from !== idx) moveModule(from, idx) }}>
                          <div className={`mod-card overflow-hidden flex flex-col h-full ${modCardMax}`} style={{ ...tileSurface, border: '1px dashed rgba(102,145,174,0.35)' }}>
                            {dragHandle}
                            <div className="p-6 flex-1">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5" style={{ ...tileIconWrap }}>
                                <div style={{ color: DYNAMO_BLUE }}><IconMap /></div>
                              </div>
                              <div style={modTitleStyle}>Meer modules</div>
                              <div style={modSubStyle}>Export, vergelijking, alerts</div>
                            </div>
                            <div className="px-6 py-3 mt-auto" style={{ ...tileFooter }}>
                              <span style={{ color: 'var(--drg-text-muted)', fontSize: '12px', fontWeight: 600, fontFamily: F }}>Binnenkort beschikbaar</span>
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
                  <div key={s.label} className="rounded-[10px] px-3 sm:px-5 py-3 sm:py-4" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
                    <div className="text-xs font-semibold uppercase mb-1" style={{ color: 'rgba(45,69,124,0.4)', letterSpacing: '0.08em', fontFamily: F }}>{s.label}</div>
                    <div className="flex items-baseline gap-1">
                      <div className="text-2xl font-bold" style={{ color: s.color, fontFamily: F, letterSpacing: '-0.03em' }}>{loading ? '...' : s.value.toLocaleString('nl-NL')}</div>
                      {!loading && trendPijl(s.value, (s as any).vorig)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Zoekbalk */}
              <div className="rounded-[10px] p-3 sm:p-4" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
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
                    <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid rgba(45,69,124,0.1)' }} role="group" aria-label="Weergave kiezen">
                      <button
                        type="button"
                        onClick={() => setWeergave('tabel')}
                        className="px-3 py-2 text-xs font-semibold transition"
                        style={{ background: weergave === 'tabel' ? DYNAMO_BLUE : 'white', color: weergave === 'tabel' ? 'white' : DYNAMO_BLUE, fontFamily: F }}
                        aria-pressed={weergave === 'tabel'}
                        title="Tabelweergave"
                      >
                        ☰ Tabel
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeergave('kaarten')}
                        className="px-3 py-2 text-xs font-semibold transition"
                        style={{ background: weergave === 'kaarten' ? DYNAMO_BLUE : 'white', color: weergave === 'kaarten' ? 'white' : DYNAMO_BLUE, fontFamily: F, borderLeft: '1px solid rgba(45,69,124,0.1)' }}
                        aria-pressed={weergave === 'kaarten'}
                        title="Kaartweergave (geschikt voor mobiel)"
                      >
                        ⊞ Kaarten
                      </button>
                    </div>
                    <div className="relative">
                      <button ref={kolomTriggerRef} onClick={() => setKolomPanelOpen(v => !v)} aria-expanded={kolomPanelOpen} aria-haspopup="dialog" aria-label="Kolommen kiezen" className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 flex items-center gap-2" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                        ⚙ Kolommen ({zichtbareKolommen.length})
                      </button>
                      {kolomPanelOpen && (
                        <div ref={kolomPanelRef} role="dialog" aria-label="Kolommen configuratie" className="absolute right-0 left-0 sm:left-auto mt-2 w-full sm:w-72 max-w-sm rounded-[10px] shadow-xl p-4 z-20" style={{ border: '1px solid var(--drg-line)', background: 'var(--drg-card-bg)' }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Kolommen</span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-lg leading-none hover:opacity-60 transition" style={{ color: 'var(--drg-text-subtle)' }} aria-label="Sluiten">✕</button>
                          </div>
                          <p className="text-xs mb-3" style={{ color: 'var(--drg-text-subtle)', fontFamily: F }}>Voorkeur wordt automatisch onthouden.</p>
                          <div className="flex gap-2 mb-3">
                            <button onClick={() => setZichtbareKolommen([...kolommen])} className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:opacity-80 transition" style={{ border: '1px solid var(--drg-line)', fontFamily: F, color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}>Alles aan</button>
                            <button onClick={() => setZichtbareKolommen(prev => prev.length > 1 ? [prev[0]] : prev)} className="flex-1 rounded-lg py-1.5 text-xs font-semibold hover:opacity-80 transition" style={{ border: '1px solid var(--drg-line)', fontFamily: F, color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}>Alles uit</button>
                          </div>
                          <div className="space-y-1 max-h-64 overflow-auto">
                            {kolommen.map(k => (
                              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-2 py-1.5 hover:opacity-80 transition">
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

              {foutmelding && (
                <div className="rounded-[10px] p-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }} role="alert">
                  <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0" aria-hidden>
                      {foutmelding.type === 'netwerk' ? '📡' : foutmelding.type === 'auth' ? '🔒' : '⚠️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: '#dc2626', fontFamily: F }}>
                        {foutmelding.type === 'auth' ? 'Geen toegang' : foutmelding.type === 'netwerk' ? 'Verbindingsfout' : 'Ophalen mislukt'}
                      </p>
                      <p className="mt-0.5 text-sm" style={{ color: 'rgba(185,28,28,0.8)', fontFamily: F }}>{foutmelding.message}</p>
                    </div>
                    {geselecteerdeWinkel && (
                      <button
                        type="button"
                        onClick={() => haalVoorraadOp(geselecteerdeWinkel.id, geselecteerdeWinkel.dealer_nummer)}
                        className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
                        style={{ background: '#dc2626', color: 'white', fontFamily: F }}
                      >
                        Opnieuw proberen
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Kaartweergave (mobiel-vriendelijk) */}
              {weergave === 'kaarten' && (
                <div>
                  {loading ? (
                    <div className="space-y-2" aria-busy="true">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="rounded-xl animate-pulse" style={{ height: 80, background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.06)' }} />
                      ))}
                    </div>
                  ) : gefilterdEnGesorteerd.length === 0 ? (
                    <div className="rounded-[10px] px-6 py-16 text-center" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)' }}>
                      <div className="text-3xl mb-3" aria-hidden>🔍</div>
                      <div className="font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                        {zoekterm.trim() !== '' || zoekKolom !== 'ALL'
                          ? 'Geen resultaten met deze zoekfilters'
                          : producten.length === 0
                            ? 'Geen voorraadgegevens voor deze winkel'
                            : 'Geen producten met voorraad ≥ 1'}
                      </div>
                      {(zoekterm.trim() !== '' || zoekKolom !== 'ALL') && (
                        <button type="button" onClick={() => { setZoekterm(''); setZoekKolom('ALL') }} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                          Wis zoekfilters
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {gefilterdEnGesorteerd.slice(0, 200).map((p, i) => {
                          const stockVal = Number(p.STOCK) || 0
                          const stockKleur = stockVal === 0 ? '#dc2626' : stockVal <= 3 ? '#d97706' : '#16a34a'
                          return (
                            <div key={i} className="rounded-xl p-3" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 1px 4px rgba(45,69,124,0.04)' }}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm leading-snug" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{p.PRODUCT_DESCRIPTION || '—'}</div>
                                  {p.BRAND_NAME && <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>{p.BRAND_NAME}</div>}
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-xl font-bold leading-none" style={{ color: stockKleur, fontFamily: F }}>{stockVal}</div>
                                  <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>stuks</div>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {p.SALES_PRICE_INC != null && (
                                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.7)', fontFamily: F }}>{formatValue('SALES_PRICE_INC', p.SALES_PRICE_INC)}</span>
                                )}
                                {p.COLOR && (
                                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.55)', fontFamily: F }}>{p.COLOR}</span>
                                )}
                                {p.FRAME_HEIGHT && (
                                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.55)', fontFamily: F }}>{p.FRAME_HEIGHT}</span>
                                )}
                                {p.BARCODE && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(45,69,124,0.04)', color: 'rgba(45,69,124,0.4)', fontFamily: 'monospace' }}>{p.BARCODE}</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {gefilterdEnGesorteerd.length > 200 && (
                        <p className="text-xs text-center mt-3 py-2" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>
                          Toont 200 van {gefilterdEnGesorteerd.length} resultaten — gebruik zoekfilters om te verfijnen.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Tabel */}
              {weergave === 'tabel' && <div className="rounded-[10px] overflow-hidden -mx-3 sm:mx-0" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
                <div
                  ref={tableContainerRef}
                  className="overflow-x-auto overflow-y-auto"
                  style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '240px', WebkitOverflowScrolling: 'touch' }}
                >
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
                        <>
                          {paddingTop > 0 && (
                            <tr aria-hidden>
                              <td style={{ height: `${paddingTop}px`, padding: 0 }} colSpan={zichtbareKolommen.length} />
                            </tr>
                          )}
                          {virtualRows.map(virtualRow => {
                            const p = gefilterdEnGesorteerd[virtualRow.index]
                            const i = virtualRow.index
                            return (
                              <tr key={virtualRow.key} data-index={virtualRow.index} ref={rowVirtualizer.measureElement} className="transition hover:bg-dynamo-blue/5" style={{ borderBottom: '1px solid rgba(45,69,124,0.05)', background: i % 2 === 1 ? 'rgba(45,69,124,0.015)' : 'white' }}>
                                {zichtbareKolommen.map(k => {
                                  const sticky = stickyEnabled && stickyKey === k
                                  const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                                  const stockVal = Number(p[k])
                                  return (
                                    <td key={k} className="px-4 py-2.5 align-middle" style={{ ...(sticky ? { position: 'sticky', left: 0, background: i % 2 === 1 ? 'rgba(45,69,124,0.015)' : 'white', zIndex: 40, boxShadow: '2px 0 0 0 rgba(45,69,124,0.06)' } : {}), minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
                                      <span className="text-sm" style={{ fontFamily: F, color: isStock ? (stockVal === 0 ? '#dc2626' : stockVal <= 3 ? '#d97706' : '#16a34a') : DYNAMO_BLUE, fontWeight: isStock ? 600 : 400, opacity: isStock ? 1 : 0.8 }}>
                                        {formatValue(k, p[k])}
                                      </span>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                          {paddingBottom > 0 && (
                            <tr aria-hidden>
                              <td style={{ height: `${paddingBottom}px`, padding: 0 }} colSpan={zichtbareKolommen.length} />
                            </tr>
                          )}
                        </>
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
              </div>}
            </>
          )}
        </div>
    </div>
  )
}