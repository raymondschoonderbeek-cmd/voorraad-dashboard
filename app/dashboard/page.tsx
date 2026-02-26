'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'

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

type Winkel = { id: number; naam: string; dealer_nummer: string; actief?: boolean }
type Product = { [key: string]: any }
type SortDir = 'asc' | 'desc'

export default function Dashboard() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)
  const [producten, setProducten] = useState<Product[]>([])
  const [kolommen, setKolommen] = useState<string[]>([])
  const [zichtbareKolommen, setZichtbareKolommen] = useState<string[]>([])
  const [zoekterm, setZoekterm] = useState('')
  const [debouncedZoekterm, setDebouncedZoekterm] = useState('')
  const [zoekKolom, setZoekKolom] = useState<string>('ALL')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [winkelLoading, setWinkelLoading] = useState(false)
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [nieuwDealer, setNieuwDealer] = useState('')
  const [kolomPanelOpen, setKolomPanelOpen] = useState(false)
  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [gebruiker, setGebruiker] = useState('')
  const [authRequired, setAuthRequired] = useState<null | { message: string; instructions?: string[] }>(null)
  const router = useRouter()
  const supabase = createClient()

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
      setZichtbareKolommen([])
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
      if (prev.length === 0) return dynamicCols
      const allowed = new Set(dynamicCols)
      const kept = prev.filter(k => allowed.has(k))
      return kept.length > 0 ? kept : dynamicCols
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
    haalVoorraadOp(geselecteerdeWinkel.dealer_nummer, debouncedZoekterm)
  }, [debouncedZoekterm, geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    setGeselecteerdeWinkel(winkel)
    setZoekterm('')
    setDebouncedZoekterm('')
    setProducten([])
    setKolommen([])
    setZichtbareKolommen([])
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
      body: JSON.stringify({ naam: nieuweNaam, dealer_nummer: nieuwDealer }),
    })
    setNieuweNaam('')
    setNieuwDealer('')
    setToonWinkelForm(false)
    setWinkelLoading(false)
    await haalWinkelsOp()
  }

  async function verwijderWinkel(id: number) {
    if (!confirm('Winkel verwijderen?')) return
    await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })
    if (geselecteerdeWinkel?.id === id) {
      setGeselecteerdeWinkel(null)
      setProducten([])
      setKolommen([])
      setZichtbareKolommen([])
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
      if (prev.includes(k)) { if (prev.length === 1) return prev; return prev.filter(x => x !== k) }
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
        const av = asSortable(a[sortKey]), bv = asSortable(b[sortKey])
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }
    return arr
  }, [producten, zoekKolom, debouncedZoekterm, sortKey, sortDir])

  const inputClass = "w-full rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb' }}>

      {/* ── NAVIGATIE ── */}
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-30 shadow-lg">
        <div className="px-5 py-0 flex items-stretch gap-0 min-h-[56px]">

          {/* Logo */}
          <div className="flex items-center gap-3 pr-6 border-r border-white/10">
            <div style={{ background: DYNAMO_GOLD }} className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-base" >
              <span style={{ color: DYNAMO_BLUE }}>D</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight tracking-wide">DYNAMO</div>
              <div style={{ color: DYNAMO_GOLD }} className="text-xs font-semibold tracking-widest leading-tight">RETAIL GROUP</div>
            </div>
          </div>

          {/* Winkel switcher */}
          <div className="flex items-center px-5 border-r border-white/10 gap-2">
            <span className="text-white/50 text-xs uppercase tracking-widest font-semibold">Winkel</span>
            <select
              value={geselecteerdeWinkel?.id ?? ''}
              onChange={e => {
                const w = winkels.find(w => w.id === Number(e.target.value))
                if (w) selecteerWinkel(w)
              }}
              className="bg-white/10 text-white text-sm rounded-lg px-3 py-1.5 border border-white/20 focus:outline-none focus:ring-2 cursor-pointer min-w-[170px]"
            >
              <option value="" disabled className="text-gray-900">Kies winkel...</option>
              {winkels.map(w => (
                <option key={w.id} value={w.id} className="text-gray-900">{w.naam}</option>
              ))}
            </select>
          </div>

          {/* Zoekbalk */}
          <div className="flex items-center flex-1 px-5 border-r border-white/10">
            <div className="relative w-full max-w-lg">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-base">⌕</span>
              <input
                type="text"
                placeholder="Zoek op product, merk, barcode..."
                value={zoekterm}
                onChange={e => setZoekterm(e.target.value)}
                className="w-full bg-white/10 text-white placeholder:text-white/40 rounded-lg pl-9 pr-4 py-2 text-sm border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
          </div>

          {/* Sidebar toggle + gebruiker + uitloggen */}
          <div className="flex items-center gap-3 pl-5">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="w-9 h-9 rounded-lg flex items-center justify-center border border-white/20 hover:bg-white/10 transition"
              title="Sidebar"
            >
              <span className="flex flex-col gap-1 w-4">
                <span className="block h-0.5 bg-white rounded" />
                <span className="block h-0.5 bg-white rounded" />
                <span className="block h-0.5 bg-white rounded" />
              </span>
            </button>

            <span className="text-white/60 text-xs hidden md:block truncate max-w-[160px]">👤 {gebruiker}</span>

            <button
              onClick={uitloggen}
              className="rounded-lg px-4 py-2 text-sm font-bold transition"
              style={{ background: DYNAMO_GOLD, color: DYNAMO_BLUE }}
            >
              Uitloggen
            </button>
          </div>
        </div>

        {/* Subtiele gouden lijn */}
        <div style={{ background: DYNAMO_GOLD, height: '3px' }} />
      </header>

      {/* ── LAYOUT ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          className="bg-white border-r border-gray-200 flex flex-col transition-all duration-200 overflow-hidden"
          style={{ width: sidebarOpen ? '260px' : '0px', minWidth: sidebarOpen ? '260px' : '0px' }}
        >
          <div className={sidebarOpen ? 'flex flex-col h-full p-4 gap-3' : 'hidden'}>

            {/* Header sidebar */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: DYNAMO_BLUE }}>Winkels</span>
              <button
                onClick={() => setToonWinkelForm(v => !v)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg transition hover:opacity-80"
                style={{ background: DYNAMO_BLUE }}
                title="Winkel toevoegen"
              >+</button>
            </div>

            {/* Winkel form */}
            {toonWinkelForm && (
              <form onSubmit={voegWinkelToe} className="rounded-xl p-3 space-y-2 border border-gray-200 bg-gray-50">
                <p className="text-xs font-semibold" style={{ color: DYNAMO_BLUE }}>Nieuwe winkel toevoegen</p>
                <input placeholder="Naam winkel" value={nieuweNaam} onChange={e => setNieuweNaam(e.target.value)} className={inputClass} required />
                <input placeholder="Dealer nummer" value={nieuwDealer} onChange={e => setNieuwDealer(e.target.value)} className={inputClass} required />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={winkelLoading}
                    className="flex-1 rounded-lg py-2 text-sm font-bold transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: DYNAMO_BLUE, color: 'white' }}
                  >{winkelLoading ? 'Bezig...' : 'Toevoegen'}</button>
                  <button type="button" onClick={() => setToonWinkelForm(false)} className="rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50">✕</button>
                </div>
              </form>
            )}

            {/* Winkellijst */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {winkels.map(w => {
                const active = geselecteerdeWinkel?.id === w.id
                return (
                  <div
                    key={w.id}
                    onClick={() => selecteerWinkel(w)}
                    className="group flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition border"
                    style={active
                      ? { background: DYNAMO_BLUE, borderColor: DYNAMO_BLUE }
                      : { background: 'white', borderColor: '#e5e7eb' }
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: active ? 'white' : DYNAMO_BLUE }}>
                        🏪 {w.naam}
                      </div>
                      <div className="text-xs" style={{ color: active ? 'rgba(255,255,255,0.6)' : '#9ca3af' }}>
                        #{w.dealer_nummer}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); verwijderWinkel(w.id) }}
                      className="opacity-0 group-hover:opacity-100 transition text-xs rounded px-1.5 py-0.5"
                      style={{ color: active ? 'white' : '#ef4444' }}
                      title="Verwijderen"
                    >✕</button>
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
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-24">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: DYNAMO_BLUE }}>🏪</div>
              <div>
                <p className="font-bold text-lg" style={{ color: DYNAMO_BLUE }}>Geen winkel geselecteerd</p>
                <p className="text-sm text-gray-500 mt-1">Kies een winkel via de navigatie of de sidebar</p>
              </div>
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                style={{ background: DYNAMO_BLUE }}
              >Sidebar openen</button>
            </div>
          ) : (
            <>
              {/* Stats balk */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Producten', value: gefilterdEnGesorteerd.length, color: DYNAMO_BLUE },
                  { label: 'Totaal voorraad', value: gefilterdEnGesorteerd.reduce((s, p) => s + (Number(p.STOCK) || 0), 0), color: DYNAMO_BLUE },
                  { label: 'Uitverkocht', value: gefilterdEnGesorteerd.filter(p => Number(p.STOCK) === 0).length, color: '#dc2626' },
                  { label: 'Merken', value: new Set(gefilterdEnGesorteerd.map(p => p.BRAND_NAME)).size, color: DYNAMO_BLUE },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{s.label}</div>
                    <div className="text-2xl font-black mt-0.5" style={{ color: s.color }}>{s.value.toLocaleString('nl-NL')}</div>
                  </div>
                ))}
              </div>

              {/* Zoek + filters balk */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
                    {geselecteerdeWinkel.naam}
                    <span className="text-gray-400 font-normal">#{dealer}</span>
                  </div>

                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <select
                      value={zoekKolom}
                      onChange={e => setZoekKolom(e.target.value)}
                      className={inputClass + ' w-auto'}
                    >
                      <option value="ALL">Alle kolommen</option>
                      {kolommen.map(k => <option key={k} value={k}>{columnLabel(k)}</option>)}
                    </select>

                    {/* Kolommen toggle */}
                    <div className="relative">
                      <button
                        onClick={() => setKolomPanelOpen(v => !v)}
                        className="rounded-lg px-4 py-2 text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-50"
                      >Kolommen ({zichtbareKolommen.length})</button>
                      {kolomPanelOpen && (
                        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-gray-200 bg-white shadow-xl p-4 z-30">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>Kolommen</span>
                            <button onClick={() => setKolomPanelOpen(false)} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
                          </div>
                          <button onClick={() => setZichtbareKolommen([...kolommen])} className="w-full mb-2 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold hover:bg-gray-50">Alles selecteren</button>
                          <div className="space-y-2 max-h-64 overflow-auto">
                            {kolommen.map(k => (
                              <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={zichtbareKolommen.includes(k)} onChange={() => toggleKolom(k)} disabled={zichtbareKolommen.includes(k) && zichtbareKolommen.length === 1} />
                                <span className="text-gray-800">{columnLabel(k)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-gray-400">
                      {loading ? 'Laden...' : isDebouncing ? 'Wachten...' : `${gefilterdEnGesorteerd.length} resultaten`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Auth fout */}
              {authRequired && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Toestemming vereist</p>
                  <p className="mt-1">{authRequired.message}</p>
                </div>
              )}

              {/* Tabel */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
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
                              className={`px-4 py-3 text-left whitespace-nowrap text-xs font-bold uppercase tracking-wide ${sticky ? 'sticky left-0' : ''}`}
                              style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.85)', background: DYNAMO_BLUE, zIndex: sticky ? 60 : undefined }}
                            >
                              <button onClick={() => toggleSort(k)} className="flex items-center gap-1 hover:opacity-80 transition">
                                {columnLabel(k)}
                                <span style={{ color: active ? DYNAMO_GOLD : 'rgba(255,255,255,0.3)' }}>
                                  {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                                </span>
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
                              <td key={k} className="px-4 py-3">
                                <div className="h-3 bg-gray-200 rounded w-24" />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : gefilterdEnGesorteerd.length === 0 ? (
                        <tr>
                          <td colSpan={zichtbareKolommen.length} className="px-6 py-12 text-center">
                            <div className="text-4xl mb-2">🔍</div>
                            <div className="font-semibold text-gray-700">Geen producten gevonden</div>
                            <div className="text-sm text-gray-400 mt-1">Probeer een andere zoekterm</div>
                          </td>
                        </tr>
                      ) : (
                        gefilterdEnGesorteerd.map((p, i) => {
                          const uitverkocht = Number(p.STOCK) === 0
                          return (
                            <tr
                              key={i}
                              className="transition hover:bg-yellow-50"
                              style={uitverkocht ? { background: '#fff7f7' } : i % 2 === 1 ? { background: '#fafafa' } : {}}
                            >
                              {zichtbareKolommen.map(k => {
                                const sticky = stickyEnabled && stickyKey === k
                                const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                                const stockVal = Number(p[k])
                                return (
                                  <td
                                    key={k}
                                    className={`px-4 py-2.5 whitespace-nowrap align-middle ${sticky ? 'sticky left-0 bg-white shadow-[2px_0_0_0_rgba(229,231,235,1)]' : ''}`}
                                    style={sticky ? { zIndex: 40 } : undefined}
                                  >
                                    <span className={isStock ? (stockVal === 0 ? 'text-red-500 font-bold' : 'text-green-600 font-semibold') : 'text-gray-800'}>
                                      {formatValue(k, p[k])}
                                    </span>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {!loading && gefilterdEnGesorteerd.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
                    <span>{gefilterdEnGesorteerd.length} producten</span>
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