'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
  actief: boolean
}

type Product = {
  [key: string]: any
}

type SortDir = 'asc' | 'desc'

const DEFAULT_KOLOMMEN = [
  'PRODUCT_DESCRIPTION',
  'BRAND_NAME',
  'BARCODE',
  'SUPPLIER_PRODUCT_NUMBER',
  'STOCK',
  'AVAILABLE_STOCK',
  'SALES_PRICE_INC',
  'GROUP_DESCRIPTION_1',
  'GROUP_DESCRIPTION_2',
  'SUPPLIER_NAME',
] as const

export default function Dashboard() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)

  const [producten, setProducten] = useState<Product[]>([])
  const [kolommen, setKolommen] = useState<string[]>([...DEFAULT_KOLOMMEN])
  const [zichtbareKolommen, setZichtbareKolommen] = useState<string[]>([...DEFAULT_KOLOMMEN])

  const [zoekterm, setZoekterm] = useState('')
  const [debouncedZoekterm, setDebouncedZoekterm] = useState('')
  const [loading, setLoading] = useState(false)

  const [winkelLoading, setWinkelLoading] = useState(false)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [nieuweNaam, setNieuweNaam] = useState('')
  const [nieuwDealer, setNieuwDealer] = useState('')

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [kolomPanelOpen, setKolomPanelOpen] = useState(false)

  // Sort
  const [sortKey, setSortKey] = useState<string>('') // geen sort init
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Filter: search in column
  const [zoekKolom, setZoekKolom] = useState<string>('ALL')

  const router = useRouter()
  const supabase = createClient()

  const haalWinkelsOp = useCallback(async () => {
    const res = await fetch('/api/winkels')
    const data = await res.json()
    setWinkels(data)
  }, [])

  const haalVoorraadOp = useCallback(async (dealer: string, q: string) => {
    setLoading(true)
    const res = await fetch(`/api/voorraad?dealer=${dealer}&q=${encodeURIComponent(q)}`)
    const data = await res.json()
    const items = Array.isArray(data) ? data : data.products ?? []
    setProducten(items)

    // Als API ooit kolommen teruggeeft, kun je hier dynamisch maken.
    // Voor nu houden we DEFAULT_KOLOMMEN aan.
    setKolommen([...DEFAULT_KOLOMMEN])
    setLoading(false)
  }, [])

  useEffect(() => {
    haalWinkelsOp()
  }, [haalWinkelsOp])

  // Debounce zoekterm
  useEffect(() => {
    const t = setTimeout(() => setDebouncedZoekterm(zoekterm), 400)
    return () => clearTimeout(t)
  }, [zoekterm])

  // Fetch op debounced term
  useEffect(() => {
    if (!geselecteerdeWinkel) return
    haalVoorraadOp(geselecteerdeWinkel.dealer_nummer, debouncedZoekterm)
  }, [debouncedZoekterm, geselecteerdeWinkel, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel) {
    setGeselecteerdeWinkel(winkel)
    setZoekterm('')
    setDebouncedZoekterm('')
    setProducten([])
    setSortKey('')
    setSortDir('asc')
    setZoekKolom('ALL')
    setKolomPanelOpen(false)
    setZichtbareKolommen([...DEFAULT_KOLOMMEN])
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
      setZoekterm('')
      setDebouncedZoekterm('')
    }

    await haalWinkelsOp()
  }

  async function uitloggen() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function toggleSort(k: string) {
    if (sortKey === k) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  const isDebouncing = zoekterm !== debouncedZoekterm

  function asSortable(v: any) {
    if (v === null || v === undefined) return ''
    const s = String(v).trim()
    const n = Number(s.replace(',', '.'))
    if (!Number.isNaN(n) && s !== '') return n
    return s.toLowerCase()
  }

  // Zichtbare kolommen altijd subset van kolommen houden
  useEffect(() => {
    setZichtbareKolommen(prev => {
      const allowed = new Set(kolommen)
      const filtered = prev.filter(k => allowed.has(k))
      return filtered.length > 0 ? filtered : [...kolommen]
    })
  }, [kolommen])

  const gefilterdEnGesorteerd = useMemo(() => {
    let arr = [...producten]

    // lokale kolom-filter (bovenop API)
    if (zoekKolom !== 'ALL' && debouncedZoekterm.trim() !== '') {
      const needle = debouncedZoekterm.toLowerCase()
      arr = arr.filter(p => String(p[zoekKolom] ?? '').toLowerCase().includes(needle))
    }

    // sort
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

  function toggleKolom(k: string) {
    setZichtbareKolommen(prev => {
      if (prev.includes(k)) {
        // voorkom dat je alles uit zet
        if (prev.length === 1) return prev
        return prev.filter(x => x !== k)
      }
      // voeg toe in oorspronkelijke volgorde
      const set = new Set([...prev, k])
      return kolommen.filter(x => set.has(x))
    })
  }

  function selectAllKolommen() {
    setZichtbareKolommen([...kolommen])
  }

  function resetKolommen() {
    setZichtbareKolommen([...DEFAULT_KOLOMMEN])
  }

  const dealer = geselecteerdeWinkel?.dealer_nummer ?? ''

  // sticky first column key
  const stickyKey = 'PRODUCT_DESCRIPTION'
  const stickyEnabled = zichtbareKolommen.includes(stickyKey)
  const stickyZIndexHead = 30
  const stickyZIndexBody = 10

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Topbar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 hover:bg-gray-50"
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              <span className="block w-5">
                <span className="block h-0.5 bg-gray-700 mb-1.5" />
                <span className="block h-0.5 bg-gray-700 mb-1.5" />
                <span className="block h-0.5 bg-gray-700" />
              </span>
            </button>

            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold truncate">📦 Voorraad Dashboard</h1>
              <p className="text-xs text-gray-500 truncate">
                {geselecteerdeWinkel ? (
                  <>
                    Actief: <span className="font-medium text-gray-700">{geselecteerdeWinkel.naam}</span>{' '}
                    <span className="text-gray-400">#{dealer}</span>
                  </>
                ) : (
                  'Selecteer een winkel om te starten'
                )}
              </p>
            </div>
          </div>

          <button onClick={uitloggen} className="text-sm font-medium text-gray-600 hover:text-red-600">
            Uitloggen
          </button>
        </div>
      </header>

      {/* Layout */}
      <div className="flex min-w-0">
        {/* Sidebar */}
        <aside
          className={[
            'border-r border-gray-200 bg-white',
            'transition-all duration-200',
            sidebarOpen ? 'w-72' : 'w-0',
          ].join(' ')}
        >
          <div className={sidebarOpen ? 'p-4 space-y-4' : 'hidden'}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">Winkels</h2>
              <button
                onClick={() => setToonWinkelForm(v => !v)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 text-blue-700"
                title="Winkel toevoegen"
                aria-label="Winkel toevoegen"
              >
                +
              </button>
            </div>

            {toonWinkelForm && (
              <form onSubmit={voegWinkelToe} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="text-xs font-semibold text-gray-700">Nieuwe winkel</div>

                <input
                  placeholder="Naam winkel"
                  value={nieuweNaam}
                  onChange={e => setNieuweNaam(e.target.value)}
                  className="w-full rounded-lg p-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <input
                  placeholder="Dealer nummer"
                  value={nieuwDealer}
                  onChange={e => setNieuwDealer(e.target.value)}
                  className="w-full rounded-lg p-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={winkelLoading}
                    className="flex-1 rounded-lg bg-blue-600 text-white py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                  >
                    {winkelLoading ? 'Bezig...' : 'Toevoegen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setToonWinkelForm(false)}
                    className="rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium hover:bg-gray-50"
                  >
                    Sluiten
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1">
              {winkels.map(winkel => {
                const active = geselecteerdeWinkel?.id === winkel.id
                return (
                  <div
                    key={winkel.id}
                    className={[
                      'group flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer',
                      active
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-800',
                    ].join(' ')}
                    onClick={() => selecteerWinkel(winkel)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">🏪 {winkel.naam}</div>
                      <div className={active ? 'text-xs text-white/80' : 'text-xs text-gray-500'}>
                        #{winkel.dealer_nummer}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        verwijderWinkel(winkel.id)
                      }}
                      className={[
                        'text-xs rounded-lg px-2 py-1 border',
                        active
                          ? 'border-white/30 text-white hover:bg-white/10'
                          : 'border-gray-200 text-red-600 hover:bg-red-50',
                        'opacity-0 group-hover:opacity-100 transition',
                      ].join(' ')}
                      title="Verwijderen"
                      aria-label="Verwijderen"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}

              {winkels.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                  Nog geen winkels. Klik op <span className="font-semibold">+</span> om toe te voegen.
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 space-y-4">
          {/* Search / actions */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
            {!geselecteerdeWinkel ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-800">Geen winkel geselecteerd</div>
                  <div className="text-sm text-gray-500">Kies links een winkel om de voorraad te bekijken.</div>
                </div>
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Sidebar openen
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      Voorraad — {geselecteerdeWinkel.naam}
                    </div>
                    <div className="text-xs text-gray-500">
                      Dealer <span className="font-medium text-gray-700">#{dealer}</span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    {isDebouncing && !loading && <span>Wachten…</span>}
                    {loading && <span>Zoeken…</span>}
                    {!loading && !isDebouncing && <span>{gefilterdEnGesorteerd.length} resultaten</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_auto] gap-3 items-stretch">
                  <select
                    value={zoekKolom}
                    onChange={(e) => setZoekKolom(e.target.value)}
                    className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="Zoeken in"
                  >
                    <option value="ALL">Zoeken in: Alle kolommen</option>
                    {kolommen.map(k => (
                      <option key={k} value={k}>
                        {k.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">⌕</span>
                    <input
                      type="text"
                      placeholder="Zoek op naam, SKU, merk..."
                      value={zoekterm}
                      onChange={e => setZoekterm(e.target.value)}
                      className="w-full rounded-xl pl-10 pr-3 py-3 text-base bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Kolommen toggle */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setKolomPanelOpen(v => !v)}
                      className="w-full lg:w-auto rounded-xl px-4 py-3 text-sm font-semibold bg-white border border-gray-300 hover:bg-gray-50"
                      title="Kolommen"
                    >
                      Kolommen ({zichtbareKolommen.length})
                    </button>

                    {kolomPanelOpen && (
                      <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-gray-200 bg-white shadow-lg p-3 z-30">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-800">Kolommen tonen</div>
                          <button
                            type="button"
                            onClick={() => setKolomPanelOpen(false)}
                            className="text-sm text-gray-500 hover:text-gray-900"
                          >
                            Sluiten
                          </button>
                        </div>

                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={selectAllKolommen}
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50"
                          >
                            Alles
                          </button>
                          <button
                            type="button"
                            onClick={resetKolommen}
                            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50"
                          >
                            Reset
                          </button>
                        </div>

                        <div className="mt-3 max-h-72 overflow-auto pr-1 space-y-2">
                          {kolommen.map(k => {
                            const checked = zichtbareKolommen.includes(k)
                            const disabled = checked && zichtbareKolommen.length === 1
                            return (
                              <label key={k} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => toggleKolom(k)}
                                />
                                <span className="text-gray-800">{k.replace(/_/g, ' ')}</span>
                                {k === stickyKey && (
                                  <span className="ml-auto text-xs text-gray-500">Sticky</span>
                                )}
                              </label>
                            )
                          })}
                        </div>

                        <div className="mt-3 text-xs text-gray-500">
                          Tip: laat <span className="font-semibold">PRODUCT DESCRIPTION</span> aan voor sticky.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          {geselecteerdeWinkel && (
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs uppercase tracking-wide text-gray-700">
                      {zichtbareKolommen.map(k => {
                        const active = sortKey === k
                        const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'

                        const isSticky = stickyEnabled && k === stickyKey

                        return (
                          <th
                            key={k}
                            className={[
                              'px-4 py-3 text-left whitespace-nowrap font-semibold',
                              isSticky ? 'sticky left-0' : '',
                            ].join(' ')}
                            style={isSticky ? { zIndex: stickyZIndexHead } : undefined}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(k)}
                              className={[
                                'inline-flex items-center gap-2 rounded-lg px-2 py-1',
                                active ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-100',
                              ].join(' ')}
                              title="Sorteren"
                            >
                              <span>{k.replace(/_/g, ' ')}</span>
                              <span className={active ? 'text-blue-700' : 'text-gray-400'}>{arrow}</span>
                            </button>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          {zichtbareKolommen.map((k) => {
                            const isSticky = stickyEnabled && k === stickyKey
                            return (
                              <td
                                key={k}
                                className={['px-4 py-3', isSticky ? 'sticky left-0 bg-white' : ''].join(' ')}
                                style={isSticky ? { zIndex: stickyZIndexBody } : undefined}
                              >
                                <div className="h-3 w-32 bg-gray-200 rounded" />
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    ) : gefilterdEnGesorteerd.length === 0 ? (
                      <tr>
                        <td colSpan={zichtbareKolommen.length} className="px-6 py-10 text-center">
                          <div className="text-sm font-semibold text-gray-800">Geen producten gevonden</div>
                          <div className="text-sm text-gray-500">
                            Probeer een andere zoekterm, of leeg de zoekbalk.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      gefilterdEnGesorteerd.map((p, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          {zichtbareKolommen.map(k => {
                            const text = String(p[k] ?? '')
                            const isStock = k === 'STOCK' || k === 'AVAILABLE_STOCK'
                            const isPrice = k === 'SALES_PRICE_INC'
                            const isSticky = stickyEnabled && k === stickyKey

                            // sticky cell background moet matchen met row zebra
                            const stickyBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

                            return (
                              <td
                                key={k}
                                className={[
                                  'px-4 py-3 whitespace-nowrap align-top',
                                  isStock ? 'font-semibold' : '',
                                  isPrice ? 'font-semibold' : '',
                                  isSticky ? `sticky left-0 ${stickyBg}` : '',
                                ].join(' ')}
                                style={isSticky ? { zIndex: stickyZIndexBody } : undefined}
                              >
                                {text}
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
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
                  <span>{gefilterdEnGesorteerd.length} producten gevonden</span>
                  <span>Tip: zet kolommen uit als je scherm klein is</span>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}