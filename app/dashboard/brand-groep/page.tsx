'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
}

type Product = { [key: string]: any }

function norm(v: any, fallback: string) {
  const s = String(v ?? '').trim()
  return s ? s : fallback
}

function toNumber(v: any) {
  const n = Number(String(v ?? 0).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function formatInt(n: number) {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(Math.round(n))
}

type GroupRow = {
  group1: string
  availableTotal: number
  itemsCount: number
  brandsCount: number
}

type BrandRow = {
  brand: string
  availableTotal: number
  itemsCount: number
}

export default function GroupToBrandAvailablePage() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)

  const [producten, setProducten] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const [groupSearch, setGroupSearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')

  const [selectedGroup, setSelectedGroup] = useState<string>('') // gekozen group_description_1

  const [sortGroupsBy, setSortGroupsBy] = useState<'available' | 'name'>('available')
  const [sortBrandsBy, setSortBrandsBy] = useState<'available' | 'name'>('available')

  const [minAvailable, setMinAvailable] = useState<number>(0) // filter op minimale beschikbaarheid in merkenlijst

  const haalWinkelsOp = useCallback(async () => {
    const res = await fetch('/api/winkels')
    const data = await res.json()
    setWinkels(data)
  }, [])

  const haalVoorraadOp = useCallback(async (dealer: string) => {
    setLoading(true)
    const res = await fetch(`/api/voorraad?dealer=${dealer}&q=`)
    const data = await res.json()
    const items = Array.isArray(data) ? data : data.products ?? []
    setProducten(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    haalWinkelsOp()
  }, [haalWinkelsOp])

  async function selecteerWinkel(id: number) {
    const winkel = winkels.find(w => w.id === id) ?? null
    setGeselecteerdeWinkel(winkel)
    setProducten([])
    setSelectedGroup('')
    setGroupSearch('')
    setBrandSearch('')
    setMinAvailable(0)
    if (winkel) await haalVoorraadOp(winkel.dealer_nummer)
  }

  // 1) Bouw groeps-overzicht (links)
  const groupRows: GroupRow[] = useMemo(() => {
    const groupTotals = new Map<string, { available: number; items: number; brands: Set<string> }>()

    for (const p of producten) {
      const group1 = norm(p.GROUP_DESCRIPTION_1, '(Geen groep 1)')
      const brand = norm(p.BRAND_NAME, '(Geen merk)')
      const available = toNumber(p.AVAILABLE_STOCK)

      const entry = groupTotals.get(group1) ?? { available: 0, items: 0, brands: new Set<string>() }
      entry.available += available
      entry.items += 1
      entry.brands.add(brand)
      groupTotals.set(group1, entry)
    }

    let rows: GroupRow[] = Array.from(groupTotals.entries()).map(([group1, v]) => ({
      group1,
      availableTotal: v.available,
      itemsCount: v.items,
      brandsCount: v.brands.size,
    }))

    const needle = groupSearch.trim().toLowerCase()
    if (needle) {
      rows = rows.filter(r => r.group1.toLowerCase().includes(needle))
    }

    rows.sort((a, b) => {
      if (sortGroupsBy === 'name') return a.group1.localeCompare(b.group1)
      // default: available desc
      return (b.availableTotal - a.availableTotal) || a.group1.localeCompare(b.group1)
    })

    return rows
  }, [producten, groupSearch, sortGroupsBy])

  // auto-selecteer de grootste groep zodra data binnen is (handig UX)
  useEffect(() => {
    if (!selectedGroup && groupRows.length > 0) {
      setSelectedGroup(groupRows[0].group1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRows.length])

  // 2) Bouw merken-overzicht (rechts) op basis van gekozen groep
  const brandRows: BrandRow[] = useMemo(() => {
    if (!selectedGroup) return []

    const brandTotals = new Map<string, { available: number; items: number }>()

    for (const p of producten) {
      const group1 = norm(p.GROUP_DESCRIPTION_1, '(Geen groep 1)')
      if (group1 !== selectedGroup) continue

      const brand = norm(p.BRAND_NAME, '(Geen merk)')
      const available = toNumber(p.AVAILABLE_STOCK)

      const entry = brandTotals.get(brand) ?? { available: 0, items: 0 }
      entry.available += available
      entry.items += 1
      brandTotals.set(brand, entry)
    }

    let rows: BrandRow[] = Array.from(brandTotals.entries()).map(([brand, v]) => ({
      brand,
      availableTotal: v.available,
      itemsCount: v.items,
    }))

    const needle = brandSearch.trim().toLowerCase()
    if (needle) {
      rows = rows.filter(r => r.brand.toLowerCase().includes(needle))
    }

    if (minAvailable > 0) {
      rows = rows.filter(r => r.availableTotal >= minAvailable)
    }

    rows.sort((a, b) => {
      if (sortBrandsBy === 'name') return a.brand.localeCompare(b.brand)
      return (b.availableTotal - a.availableTotal) || a.brand.localeCompare(b.brand)
    })

    return rows
  }, [producten, selectedGroup, brandSearch, sortBrandsBy, minAvailable])

  const selectedGroupMeta = useMemo(() => {
    const row = groupRows.find(r => r.group1 === selectedGroup)
    return row ?? null
  }, [groupRows, selectedGroup])

  const maxBrandValue = useMemo(() => {
    return brandRows.reduce((m, r) => Math.max(m, r.availableTotal), 0)
  }, [brandRows])

  const winkelLabel = geselecteerdeWinkel
    ? `${geselecteerdeWinkel.naam} (#${geselecteerdeWinkel.dealer_nummer})`
    : ''

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Beschikbare voorraad per merk</h1>
            <p className="text-sm text-gray-500">
              Selecteer eerst een <span className="font-medium">groep 1</span>. Daarna zie je per merk de som van{' '}
              <span className="font-medium">AVAILABLE_STOCK</span>.
              {winkelLabel ? ` (${winkelLabel})` : ''}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              ← Terug naar dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-gray-600">Winkel</label>
            <select
              value={geselecteerdeWinkel?.id ?? ''}
              onChange={e => selecteerWinkel(Number(e.target.value))}
              className="mt-1 w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Selecteer winkel…</option>
              {winkels.map(w => (
                <option key={w.id} value={w.id}>
                  {w.naam} (#{w.dealer_nummer})
                </option>
              ))}
            </select>
          </div>

          <div className="text-sm text-gray-600 flex items-center justify-end">
            {loading ? 'Laden…' : geselecteerdeWinkel ? `${producten.length} regels geladen` : ''}
          </div>
        </div>
      </div>

      {/* Content */}
      {!geselecteerdeWinkel ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-gray-500">
          Kies een winkel om te starten.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          {/* LEFT: group selection table */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-gray-800">1) Kies groep 1</div>
                  <div className="text-xs text-gray-500">Klik op een rij om te selecteren.</div>
                </div>

                <select
                  value={sortGroupsBy}
                  onChange={e => setSortGroupsBy(e.target.value as any)}
                  className="rounded-xl px-3 py-2 text-xs bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Sortering groepen"
                >
                  <option value="available">Sort: beschikbaar</option>
                  <option value="name">Sort: naam</option>
                </select>
              </div>

              <input
                value={groupSearch}
                onChange={e => setGroupSearch(e.target.value)}
                placeholder="Zoek groep 1…"
                className="mt-3 w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="overflow-auto relative" style={{ maxHeight: 520 }}>
              <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr className="text-xs uppercase tracking-wide text-gray-700">
                    <th className="px-4 py-3 text-left font-semibold">Groep 1</th>
                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Beschikbaar</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-3">
                          <div className="h-3 w-48 bg-gray-200 rounded" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="h-3 w-16 bg-gray-200 rounded ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : groupRows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-10 text-center text-gray-500">
                        Geen groepen gevonden.
                      </td>
                    </tr>
                  ) : (
                    groupRows.map((r, i) => {
                      const selected = r.group1 === selectedGroup
                      return (
                        <tr
                          key={`${r.group1}-${i}`}
                          className={[
                            'cursor-pointer',
                            selected ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                            'hover:bg-blue-50/60',
                          ].join(' ')}
                          onClick={() => setSelectedGroup(r.group1)}
                          title="Selecteer groep"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={[
                                  'inline-flex w-2 h-2 rounded-full',
                                  selected ? 'bg-blue-600' : 'bg-gray-300',
                                ].join(' ')}
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-gray-900 truncate">{r.group1}</div>
                                <div className="text-xs text-gray-500">
                                  {r.brandsCount} merken • {r.itemsCount} regels
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                            {formatInt(r.availableTotal)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: brand overview for selected group */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-800">
                      2) Overzicht per merk
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      Geselecteerde groep: <span className="font-semibold text-gray-900">{selectedGroup || '—'}</span>
                    </div>
                    {selectedGroupMeta && (
                      <div className="text-xs text-gray-500">
                        Totaal beschikbaar: <span className="font-semibold">{formatInt(selectedGroupMeta.availableTotal)}</span>{' '}
                        • {selectedGroupMeta.brandsCount} merken • {selectedGroupMeta.itemsCount} regels
                      </div>
                    )}
                  </div>

                  <select
                    value={sortBrandsBy}
                    onChange={e => setSortBrandsBy(e.target.value as any)}
                    className="rounded-xl px-3 py-2 text-xs bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="Sortering merken"
                  >
                    <option value="available">Sort: beschikbaar</option>
                    <option value="name">Sort: merknaam</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px] gap-3">
                  <input
                    value={brandSearch}
                    onChange={e => setBrandSearch(e.target.value)}
                    placeholder="Zoek merk…"
                    className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!selectedGroup}
                  />

                  <div>
                    <label className="text-xs font-semibold text-gray-600">Min beschikbaar</label>
                    <input
                      type="number"
                      min={0}
                      value={minAvailable}
                      onChange={e => setMinAvailable(Math.max(0, Number(e.target.value) || 0))}
                      className="mt-1 w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedGroup}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-auto relative" style={{ maxHeight: 520 }}>
              <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr className="text-xs uppercase tracking-wide text-gray-700">
                    <th className="px-4 py-3 text-left font-semibold">Merk</th>
                    <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Beschikbaar</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-3">
                          <div className="h-3 w-48 bg-gray-200 rounded" />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="h-3 w-16 bg-gray-200 rounded ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : !selectedGroup ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-10 text-center text-gray-500">
                        Selecteer links een groep om merken te tonen.
                      </td>
                    </tr>
                  ) : brandRows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-6 py-10 text-center text-gray-500">
                        Geen merken gevonden (filter te streng?).
                      </td>
                    </tr>
                  ) : (
                    brandRows.map((r, i) => {
                      const bg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      const pct = maxBrandValue > 0 ? Math.round((r.availableTotal / maxBrandValue) * 100) : 0

                      return (
                        <tr key={`${r.brand}-${i}`} className={bg}>
                          <td className="px-4 py-3">
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 truncate">{r.brand}</div>
                              <div className="mt-1 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="text-xs text-gray-500 mt-1">{r.itemsCount} regels</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                            {formatInt(r.availableTotal)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && selectedGroup && brandRows.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
                <span>{brandRows.length} merken</span>
                <span>Tip: gebruik “Min beschikbaar” om ruis weg te filteren</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}