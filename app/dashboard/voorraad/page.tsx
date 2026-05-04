'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR from 'swr'
import { WinkelModal } from '@/components/WinkelModal'
import { DYNAMO_BLUE, dashboardUi } from '@/lib/theme'
import { IconChart, IconPin, IconArrowLeft } from '@/components/DashboardIcons'
import type { Winkel } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const KOLOMMEN_STORAGE_KEY = 'dynamo_zichtbare_kolommen'
const WINKEL_STORAGE_KEY = 'dynamo_geselecteerde_winkel_id'
const F = "'Outfit', sans-serif"

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

function formatValue(key: string, value: unknown) {
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

function asSortable(v: unknown) {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  const n = Number(s.replace(',', '.'))
  if (!Number.isNaN(n) && s !== '') return n
  return s.toLowerCase()
}

function isFiets(p: Record<string, unknown>) {
  const g = String(p.GROUP_DESCRIPTION_1 ?? '').toLowerCase()
  if (p._source === 'vendit') {
    const heeftFiets = g.includes('fietsen') || g.includes('fiets')
    const isOnderdelen = g.includes('onderdelen')
    return heeftFiets && !isOnderdelen
  }
  return g.includes('fiets') || g.includes('bike') || g.includes('cycle') || g.includes('ebike') || g.includes('e-bike')
}

function matchesSearch(item: Record<string, unknown>, zoekterm: string): boolean {
  const words = zoekterm.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const allText = Object.values(item).map(v => String(v ?? '').toLowerCase()).join(' ')
  return words.every(word => allText.includes(word))
}

type Product = Record<string, unknown>
type SortDir = 'asc' | 'desc'

export default function VoorraadPagina() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const { data: winkelsData = [], isLoading: winkelsLoading, mutate: mutateWinkels } = useSWR<Winkel[]>('/api/winkels', fetcher, { revalidateOnFocus: true })
  const winkels = Array.isArray(winkelsData) ? winkelsData : []
  const { data: sessionData } = useSWR<{
    allowedCountries?: ('Netherlands' | 'Belgium')[] | null
  }>('/api/auth/session-info', fetcher)
  const allowedCountries = sessionData?.allowedCountries ?? null

  const winkelsVoorGebruiker = useMemo(() => {
    if (!allowedCountries || allowedCountries.length === 0) return winkels
    return winkels.filter(w => {
      if (!w.land) return true
      return allowedCountries.includes(w.land)
    })
  }, [winkels, allowedCountries])

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
  const [foutmelding, setFoutmelding] = useState<null | { message: string; type: 'auth' | 'netwerk' | 'server' }>(null)
  const [weergave, setWeergave] = useState<'tabel' | 'kaarten'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'kaarten' : 'tabel'
  )
  const [vorigeStats, setVorigeStats] = useState<{ producten: number; voorraad: number } | null>(null)
  const [temperatuur, setTemperatuur] = useState<number | null>(null)
  const [winkelModalOpen, setWinkelModalOpen] = useState(false)

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const kolomPanelRef = useRef<HTMLDivElement>(null)
  const kolomTriggerRef = useRef<HTMLButtonElement>(null)

  // Kolommen herstellen uit localStorage
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

  // Winkel herstellen uit URL — alleen via ?winkel=ID, nooit automatisch uit localStorage
  useEffect(() => {
    if (winkelsVoorGebruiker.length === 0 || sessionData === undefined) return
    const idParam = searchParams.get('winkel')
    if (idParam) {
      const w = winkelsVoorGebruiker.find(x => x.id === Number(idParam))
      if (w) { setGeselecteerdeWinkel(w); setWinkelModalOpen(false); return }
    }
    // Geen URL-param: altijd winkelkiezer tonen
    setWinkelModalOpen(true)
  }, [winkelsVoorGebruiker, searchParams, sessionData])

  // Temperatuur voor geselecteerde winkel
  useEffect(() => {
    const w = geselecteerdeWinkel
    if (!w?.lat || !w?.lng) { setTemperatuur(null); return }
    let cancelled = false
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lng}&current=temperature_2m`)
      .then(r => r.json())
      .then((data: { current?: { temperature_2m?: number } }) => {
        if (!cancelled && typeof data?.current?.temperature_2m === 'number') setTemperatuur(data.current.temperature_2m)
      })
      .catch(() => { if (!cancelled) setTemperatuur(null) })
    return () => { cancelled = true }
  }, [geselecteerdeWinkel?.id, geselecteerdeWinkel?.lat, geselecteerdeWinkel?.lng])

  // Kolom-panel focus management
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
      setFoutmelding({ message: (data as { message?: string })?.message ?? 'Voorraad ophalen mislukt.', type })
      setLoading(false)
      return
    }
    const items: Product[] = Array.isArray(data) ? data : ((data as { products?: Product[] }).products ?? [])
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
        const kept = (opgeslagen as string[]).filter(k => allowed.has(k))
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
    if (!geselecteerdeWinkel) return
    haalVoorraadOp(geselecteerdeWinkel.id, geselecteerdeWinkel.kassa_nummer)
  }, [geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    try { localStorage.setItem(WINKEL_STORAGE_KEY, String(winkel.id)) } catch {}
    if (winkel.api_type === 'vendit') mutateWinkels()
    setVorigeStats(producten.length > 0 ? {
      producten: producten.length,
      voorraad: producten.reduce((s, p) => s + (Number(p.STOCK) || 0), 0),
    } : null)
    setGeselecteerdeWinkel(winkel)
    router.replace(`/dashboard/voorraad?winkel=${winkel.id}`)
    setZoekterm(''); setProducten([]); setKolommen([])
    setSortKey(''); setZoekKolom('ALL'); setKolomPanelOpen(false); setFoutmelding(null)
    await haalVoorraadOp(winkel.id, winkel.kassa_nummer)
  }

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

  const stickyKey = kolommen.find(isSticky)
  const stickyEnabled = !!stickyKey && zichtbareKolommen.includes(stickyKey)
  const dealer = geselecteerdeWinkel?.kassa_nummer ?? ''
  const venditLaatstDatum = geselecteerdeWinkel
    ? (winkelsVoorGebruiker.find(w => w.id === geselecteerdeWinkel!.id)?.vendit_laatst_datum ?? geselecteerdeWinkel.vendit_laatst_datum)
    : null
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

      <WinkelModal
        open={winkelModalOpen}
        onClose={() => setWinkelModalOpen(false)}
        winkels={winkelsVoorGebruiker}
        onSelect={selecteerWinkel}
        loading={winkelModalOpen && winkelsLoading}
      />

      <div style={{ padding: '24px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Paginakop */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--drg-text-3)', margin: 0 }}>Voorraad</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--drg-ink-2)', margin: '2px 0 0', fontFamily: F }}>
              {geselecteerdeWinkel ? geselecteerdeWinkel.naam : 'Selecteer een winkel'}
            </h1>
            {geselecteerdeWinkel && (
              <p style={{ fontSize: 13, color: 'var(--drg-text-3)', margin: '2px 0 0' }}>
                Actuele voorraad per product
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {geselecteerdeWinkel && (
              <button
                type="button"
                onClick={() => setWinkelModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-90"
                style={{ color: DYNAMO_BLUE, fontFamily: F, background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.12)' }}
              >
                <IconArrowLeft aria-hidden /> Andere winkel
              </button>
            )}
          </div>
        </div>

        {/* Geen winkel geselecteerd */}
        {!geselecteerdeWinkel && !winkelsLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: 16, borderRadius: 12, border: '1px solid var(--drg-line)', background: 'var(--drg-card)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(45,69,124,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={DYNAMO_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: DYNAMO_BLUE, margin: 0, fontFamily: F }}>Kies een winkel</p>
              <p style={{ fontSize: 13, color: 'var(--drg-text-3)', margin: '4px 0 0', fontFamily: F }}>
                Selecteer een vestiging om de voorraad te bekijken
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWinkelModalOpen(true)}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              style={{ background: DYNAMO_BLUE, fontFamily: F }}
            >
              Winkel kiezen
            </button>
          </div>
        )}

        {winkelsLoading && !geselecteerdeWinkel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderRadius: 10, background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.08)' }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} aria-hidden />
            <span style={{ fontSize: 14, color: DYNAMO_BLUE, fontFamily: F }}>Winkels laden…</span>
          </div>
        )}

        {/* Voorraad content */}
        {geselecteerdeWinkel && (
          <>
            {loading && (
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }} role="status" aria-live="polite" aria-busy="true">
                <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} aria-hidden />
                <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Voorraad laden voor {geselecteerdeWinkel.naam}…</span>
              </div>
            )}

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
                    {!loading && trendPijl(s.value, (s as { vorig?: number }).vorig)}
                  </div>
                </div>
              ))}
            </div>

            {/* Zoekbalk + filters */}
            <div className="rounded-[10px] p-3 sm:p-4" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-bold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{geselecteerdeWinkel.naam}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.45)', fontFamily: F }}>#{dealer}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                      {new Date().toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {temperatuur != null && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                        {Math.round(temperatuur)}°C {geselecteerdeWinkel.stad ? `(${geselecteerdeWinkel.stad})` : ''}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                      {bron === 'wilmar' ? 'Wilmar' : (bron === 'vendit' || bron === 'vendit_api') ? 'Vendit' : 'CycleSoftware'}
                    </span>
                    {bron === 'vendit' && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.08)', color: 'rgba(45,69,124,0.7)', fontFamily: F }}>
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
                    {geselecteerdeWinkel.stad && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(45,69,124,0.4)' }}>
                        <IconPin />{geselecteerdeWinkel.stad}
                      </span>
                    )}
                    {geselecteerdeWinkel.land && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: geselecteerdeWinkel.land === 'Belgium' ? 'rgba(253,218,36,0.2)' : 'rgba(255,102,0,0.15)', color: geselecteerdeWinkel.land === 'Belgium' ? '#a16207' : '#c2410c', fontFamily: F }}>
                        {geselecteerdeWinkel.land === 'Belgium' ? 'België' : 'Nederland'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link
                      href={`/dashboard/brand-groep?winkel=${geselecteerdeWinkel.id}`}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-80 shrink-0"
                      style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.08)', fontFamily: F }}
                    >
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
                    <input
                      type="text"
                      placeholder="Zoek op product, merk, barcode..."
                      value={zoekterm}
                      onChange={e => setZoekterm(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 pl-9 text-sm"
                      style={inputStyle}
                    />
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
                    <button
                      ref={kolomTriggerRef}
                      onClick={() => setKolomPanelOpen(v => !v)}
                      aria-expanded={kolomPanelOpen}
                      aria-haspopup="dialog"
                      aria-label="Kolommen kiezen"
                      className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 flex items-center gap-2"
                      style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}
                    >
                      ⚙ Kolommen ({zichtbareKolommen.length})
                    </button>
                    {kolomPanelOpen && (
                      <div ref={kolomPanelRef} role="dialog" aria-label="Kolommen configuratie" className="absolute right-0 left-0 sm:left-auto mt-2 w-full sm:w-72 max-w-sm rounded-[10px] bg-white shadow-xl p-4 z-20" style={{ border: '1px solid rgba(45,69,124,0.1)' }}>
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
                  <button
                    type="button"
                    onClick={() => haalVoorraadOp(geselecteerdeWinkel.id, geselecteerdeWinkel.kassa_nummer)}
                    className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition hover:opacity-90"
                    style={{ background: '#dc2626', color: 'white', fontFamily: F }}
                  >
                    Opnieuw proberen
                  </button>
                </div>
              </div>
            )}

            {/* Kaartweergave */}
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
                                <div className="font-semibold text-sm leading-snug" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{String(p.PRODUCT_DESCRIPTION || '—')}</div>
                                {p.BRAND_NAME != null && <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>{String(p.BRAND_NAME)}</div>}
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
                              {p.COLOR != null && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.55)', fontFamily: F }}>{String(p.COLOR)}</span>
                              )}
                              {p.FRAME_HEIGHT != null && (
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.55)', fontFamily: F }}>{String(p.FRAME_HEIGHT)}</span>
                              )}
                              {p.BARCODE != null && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(45,69,124,0.04)', color: 'rgba(45,69,124,0.4)', fontFamily: 'monospace' }}>{String(p.BARCODE)}</span>
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
            {weergave === 'tabel' && (
              <div className="rounded-[10px] overflow-hidden -mx-3 sm:mx-0" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
                <div
                  ref={tableContainerRef}
                  className="overflow-x-auto overflow-y-auto"
                  style={{ maxHeight: 'calc(100vh - 320px)', minHeight: '240px', WebkitOverflowScrolling: 'touch' }}
                >
                  <table className="w-full text-sm min-w-[600px] [border-collapse:separate] [border-spacing:0]">
                    <thead className="sticky top-0" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        {zichtbareKolommen.map(k => {
                          const active = sortKey === k
                          const sticky = stickyEnabled && stickyKey === k
                          return (
                            <th key={k} scope="col" className="px-4 py-3 text-left" style={{ color: active ? 'white' : 'rgba(255,255,255,0.7)', background: DYNAMO_BLUE, fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F, position: 'sticky', top: 0, left: sticky ? 0 : undefined, zIndex: sticky ? 20 : 10, minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
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
                                    <td key={k} className="px-4 py-2.5 align-middle" style={{ ...(sticky ? { position: 'sticky', left: 0, background: i % 2 === 1 ? 'rgba(45,69,124,0.015)' : 'white', zIndex: 9, boxShadow: '2px 0 0 0 rgba(45,69,124,0.06)' } : {}), minWidth: columnMinWidth(k), whiteSpace: columnMinWidth(k) ? 'normal' : 'nowrap' }}>
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
