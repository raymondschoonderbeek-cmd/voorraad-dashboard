'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { WinkelSelect } from '@/components/WinkelSelect'
import { WinkelModal } from '@/components/WinkelModal'
import { DYNAMO_BLUE, DYNAMO_GOLD } from '@/lib/theme'
import type { Winkel } from '@/lib/types'
const WINKEL_STORAGE_KEY = 'dynamo_geselecteerde_winkel_id'
type Product = { [key: string]: any }

const BRAND_ALIASES: Record<string, string> = {
  vanraam: 'vanraam',
}

function normalizeKey(input: any, fallbackKey = '(onbekend)') {
  const raw = String(input ?? '').trim()
  if (!raw) return fallbackKey
  let cleaned = raw.toLowerCase()
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  cleaned = cleaned.replace(/[-_]+/g, ' ')
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  return cleaned || fallbackKey
}

function toTitleCase(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function normalizeLabel(input: any, fallbackLabel = '(Onbekend)') {
  const key = normalizeKey(input, fallbackLabel.toLowerCase())
  if (key === fallbackLabel.toLowerCase()) return fallbackLabel
  return toTitleCase(key)
}

function normalizeBrandKey(input: any) {
  const base = normalizeKey(input, '(geen merk)')
  const noSpaces = base.replace(/\s+/g, '')
  return BRAND_ALIASES[noSpaces] ?? noSpaces
}

function normalizeBrandLabel(input: any) {
  return normalizeLabel(input, '(Geen merk)')
}

function toNumber(v: any) {
  const n = Number(String(v ?? 0).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function formatInt(n: number) {
  return new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(Math.round(n))
}

function formatMoney(v: any) {
  const n = Number(String(v ?? '').replace(',', '.'))
  if (!Number.isFinite(n)) return String(v ?? '')
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

type GroupRow = { groupKey: string; groupLabel: string; availableTotal: number; itemsCount: number; brandsCount: number }
type BrandRow = { brandKey: string; brandLabel: string; availableTotal: number; itemsCount: number }
type ProductRow = {
  description: string
  supplierSku: string
  barcode: string
  supplierNameLabel: string
  available: number
  stock: number
  priceInc: any
  raw: Product
}

type BrandIndex = {
  brandKey: string
  brandLabel: string
  availableTotal: number
  itemsCount: number
  // al gefilterd op voorraad >= 1
  products: ProductRow[]
}

type GroupIndex = {
  groupKey: string
  groupLabel: string
  availableTotal: number
  itemsCount: number
  brandsCount: number
  brandMap: Map<string, BrandIndex>
}

export default function BrandGroepPage() {
  const searchParams = useSearchParams()
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [winkelsLoading, setWinkelsLoading] = useState(true)
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)
  const [producten, setProducten] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const [groupSearch, setGroupSearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const deferredGroupSearch = useDeferredValue(groupSearch)
  const deferredBrandSearch = useDeferredValue(brandSearch)
  const deferredProductSearch = useDeferredValue(productSearch)

  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)

  const [sortGroupsBy, setSortGroupsBy] = useState<'available' | 'name'>('available')
  const [sortBrandsBy, setSortBrandsBy] = useState<'available' | 'name'>('available')

  const [minAvailable, setMinAvailable] = useState<number>(0)
  const [top10Brands, setTop10Brands] = useState<boolean>(false)
  const [winkelModalOpen, setWinkelModalOpen] = useState(() => {
    if (searchParams.get('winkel')) return false
    try { if (typeof window !== 'undefined' && localStorage.getItem(WINKEL_STORAGE_KEY)) return false } catch {}
    return true
  })
  const [authRequired, setAuthRequired] = useState<null | { message: string }>(null)

  const haalWinkelsOp = useCallback(async () => {
    setWinkelsLoading(true)
    try {
      const res = await fetch('/api/winkels')
      const data = await res.json()
      setWinkels(Array.isArray(data) ? data : [])
    } finally {
      setWinkelsLoading(false)
    }
  }, [])

  const haalVoorraadOp = useCallback(async (winkelId: number, dealer: string) => {
    setLoading(true)
    setAuthRequired(null)
    const params = new URLSearchParams()
    if (winkelId) params.set('winkel', String(winkelId))
    if (dealer) params.set('dealer', dealer)
    params.set('q', '')

    const res = await fetch(`/api/voorraad?${params.toString()}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setProducten([])
      setAuthRequired({ message: data?.message ?? 'Voorraad ophalen mislukt.' })
      setLoading(false)
      return
    }
    const items = Array.isArray(data) ? data : data.products ?? []
    setProducten(items)
    setLoading(false)
  }, [])

  useEffect(() => { haalWinkelsOp() }, [haalWinkelsOp])

  useEffect(() => {
    if (winkels.length === 0 || geselecteerdeWinkel) return
    const idParam = searchParams.get('winkel')
    const id = idParam ? Number(idParam) : (() => {
      try {
        const s = localStorage.getItem(WINKEL_STORAGE_KEY)
        return s ? Number(s) : 0
      } catch { return 0 }
    })()
    const w = id ? winkels.find(x => x.id === id) : null
    if (w) {
      setGeselecteerdeWinkel(w)
      setWinkelModalOpen(false)
      haalVoorraadOp(w.id, w.dealer_nummer)
    }
  }, [winkels, geselecteerdeWinkel, searchParams, haalVoorraadOp])

  async function selecteerWinkel(winkel: Winkel | null) {
    if (winkel) {
      try { localStorage.setItem(WINKEL_STORAGE_KEY, String(winkel.id)) } catch {}
    }
    setGeselecteerdeWinkel(winkel)
    setProducten([])
    setAuthRequired(null)
    setSelectedGroup('')
    setSelectedBrand('')
    setSelectedProduct(null)
    setGroupSearch('')
    setBrandSearch('')
    setMinAvailable(0)
    setTop10Brands(false)
    if (winkel) await haalVoorraadOp(winkel.id, winkel.dealer_nummer)
  }

  // ✅ Filter alvast 0-voorraad weg (basis voor alles)
  const productenMetVoorraad = useMemo(() => {
    return producten.filter(p => toNumber(p.STOCK) >= 1)
  }, [producten])

  /**
   * 🚀 INDEX: 1x bouwen per voorraad-load
   * groupKey -> { totals + brandMap }
   * brandKey -> { totals + products[] }
   */
  const groupIndexMap = useMemo(() => {
    const gMap = new Map<string, GroupIndex>()

    for (const p of productenMetVoorraad) {
      const groupKey = normalizeKey(p.GROUP_DESCRIPTION_1, '(geen groep 1)')
      const groupLabel = normalizeLabel(p.GROUP_DESCRIPTION_1, '(Geen groep 1)')

      const brandKey = normalizeBrandKey(p.BRAND_NAME)
      const brandLabel = normalizeBrandLabel(p.BRAND_NAME)

      const available = toNumber(p.AVAILABLE_STOCK)
      const stock = toNumber(p.STOCK)
      if (stock < 1) continue // dubbele zekerheid

      let g = gMap.get(groupKey)
      if (!g) {
        g = {
          groupKey,
          groupLabel,
          availableTotal: 0,
          itemsCount: 0,
          brandsCount: 0,
          brandMap: new Map<string, BrandIndex>(),
        }
        gMap.set(groupKey, g)
      }

      g.availableTotal += available
      g.itemsCount += 1

      let b = g.brandMap.get(brandKey)
      if (!b) {
        b = {
          brandKey,
          brandLabel,
          availableTotal: 0,
          itemsCount: 0,
          products: [],
        }
        g.brandMap.set(brandKey, b)
      }

      b.availableTotal += available
      b.itemsCount += 1

      b.products.push({
        description: String(p.PRODUCT_DESCRIPTION ?? '').trim(),
        supplierSku: String(p.SUPPLIER_PRODUCT_NUMBER ?? '').trim(),
        barcode: String(p.BARCODE ?? '').trim(),
        supplierNameLabel: normalizeLabel(p.SUPPLIER_NAME, '(Geen leverancier)'),
        available,
        stock,
        priceInc: p.SALES_PRICE_INC,
        raw: p,
      })
    }

    // brandsCount & sort product arrays alvast 1x
    for (const g of gMap.values()) {
      g.brandsCount = g.brandMap.size
      for (const b of g.brandMap.values()) {
        b.products.sort((a, b2) => (b2.stock - a.stock) || a.description.localeCompare(b2.description))
      }
    }

    return gMap
  }, [productenMetVoorraad])

  const groupRows: GroupRow[] = useMemo(() => {
    let rows: GroupRow[] = Array.from(groupIndexMap.values()).map(g => ({
      groupKey: g.groupKey,
      groupLabel: g.groupLabel,
      availableTotal: g.availableTotal,
      itemsCount: g.itemsCount,
      brandsCount: g.brandsCount,
    }))

    const needle = deferredGroupSearch.trim().toLowerCase()
    if (needle) rows = rows.filter(r => r.groupLabel.toLowerCase().includes(needle))

    rows.sort((a, b) =>
      sortGroupsBy === 'name'
        ? a.groupLabel.localeCompare(b.groupLabel)
        : (b.availableTotal - a.availableTotal) || a.groupLabel.localeCompare(b.groupLabel)
    )
    return rows
  }, [groupIndexMap, deferredGroupSearch, sortGroupsBy])

  useEffect(() => {
    if (!selectedGroup && groupRows.length > 0) {
      setSelectedGroup(groupRows[0].groupKey)
      setSelectedBrand('')
      setSelectedProduct(null)
    }
  }, [groupRows, selectedGroup])

  const brandRows: BrandRow[] = useMemo(() => {
    if (!selectedGroup) return []
    const g = groupIndexMap.get(selectedGroup)
    if (!g) return []

    let rows: BrandRow[] = Array.from(g.brandMap.values()).map(b => ({
      brandKey: b.brandKey,
      brandLabel: b.brandLabel,
      availableTotal: b.availableTotal,
      itemsCount: b.itemsCount,
    }))

    const needle = deferredBrandSearch.trim().toLowerCase()
    if (needle) rows = rows.filter(r => r.brandLabel.toLowerCase().includes(needle))

    if (minAvailable > 0) rows = rows.filter(r => r.availableTotal >= minAvailable)

    rows.sort((a, b) =>
      sortBrandsBy === 'name'
        ? a.brandLabel.localeCompare(b.brandLabel)
        : (b.availableTotal - a.availableTotal) || a.brandLabel.localeCompare(b.brandLabel)
    )

    if (top10Brands) rows = rows.slice(0, 10)
    return rows
  }, [groupIndexMap, selectedGroup, deferredBrandSearch, sortBrandsBy, minAvailable, top10Brands])

  const selectedGroupMeta = useMemo(() => groupRows.find(r => r.groupKey === selectedGroup) ?? null, [groupRows, selectedGroup])
  const selectedBrandMeta = useMemo(() => brandRows.find(r => r.brandKey === selectedBrand) ?? null, [brandRows, selectedBrand])
  const maxBrandValue = useMemo(() => brandRows.reduce((m, r) => Math.max(m, r.availableTotal), 0), [brandRows])

  const productRows: ProductRow[] = useMemo(() => {
    if (!selectedGroup || !selectedBrand) return []
    const g = groupIndexMap.get(selectedGroup)
    if (!g) return []
    const b = g.brandMap.get(selectedBrand)
    if (!b) return []
    let rows = b.products
    const needle = deferredProductSearch.trim().toLowerCase()
    if (needle) {
      const words = needle.split(/\s+/).filter(Boolean)
      rows = rows.filter(r => {
        const text = [r.description, r.supplierSku, r.barcode, r.supplierNameLabel].map(x => String(x ?? '').toLowerCase()).join(' ')
        return words.every(w => text.includes(w))
      })
    }
    return rows
  }, [groupIndexMap, selectedGroup, selectedBrand, deferredProductSearch])

  const drilldownAvailableTotal = useMemo(
    () => productRows.reduce((sum, r) => sum + (r.available || 0), 0),
    [productRows]
  )

  useEffect(() => { setSelectedProduct(null); setProductSearch('') }, [selectedGroup, selectedBrand])

  const inputClass =
    'w-full rounded-xl px-3 py-2.5 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-dynamo-blue focus:outline-none focus:ring-2 focus:ring-dynamo-blue/30'

  return (
    <div style={{ minHeight: '100%' }}>
      <WinkelModal
        open={winkelModalOpen}
        onClose={() => setWinkelModalOpen(false)}
        winkels={winkels}
        onSelect={selecteerWinkel}
        loading={winkelModalOpen && winkelsLoading}
      />

      <div className="space-y-4 overflow-x-hidden" style={{ padding: '24px 28px' }}>
        {!geselecteerdeWinkel ? (
          searchParams.get('winkel') && winkelsLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
              <p className="font-semibold" style={{ color: DYNAMO_BLUE }}>Winkel en voorraad laden...</p>
            </div>
          ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: DYNAMO_BLUE }}>📊</div>
            <p className="font-bold text-lg" style={{ color: DYNAMO_BLUE }}>Kies een winkel</p>
            <button
              onClick={() => setWinkelModalOpen(true)}
              className="rounded-xl px-5 py-2.5 font-semibold text-sm transition hover:opacity-90"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.35)' }}
            >
              Kies een winkel
            </button>
          </div>
          )
        ) : (
          <div className="space-y-4">
            {loading && (
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.1)' }}>
                <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin shrink-0" style={{ borderColor: DYNAMO_BLUE }} />
                <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Voorraad laden voor Merk/Groep...</span>
              </div>
            )}
            {authRequired && (
              <div className="rounded-[10px] p-4 text-sm" style={{ background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.2)' }}>
                <p className="font-semibold" style={{ color: DYNAMO_BLUE }}>Toestemming vereist</p>
                <p className="mt-1" style={{ color: 'rgba(45,69,124,0.6)' }}>{authRequired.message}</p>
              </div>
            )}
            <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-4">
              {/* Groepen */}
              <div className="rounded-[10px] shadow-sm overflow-hidden flex flex-col" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
                <div className="p-4 border-b border-gray-200" style={{ borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>1) Kies groep</div>
                      <div className="text-xs text-gray-500">Sneller door index · voorraad ≥ 1</div>
                    </div>
                    <select
                      value={sortGroupsBy}
                      onChange={e => setSortGroupsBy(e.target.value as any)}
                      className="rounded-lg px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300 focus:outline-none"
                    >
                      <option value="available">Beschikbaar ↓</option>
                      <option value="name">Naam A-Z</option>
                    </select>
                  </div>
                  <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Zoek groep..." className={inputClass} />
                </div>

                <div className="overflow-auto flex-1" style={{ maxHeight: 480, WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm min-w-[280px]">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-white/85">Groep</th>
                        <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-white/85">Beschikbaar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-4 py-3"><div className="h-3 w-40 bg-gray-200 rounded" /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 bg-gray-200 rounded ml-auto" /></td>
                          </tr>
                        ))
                      ) : groupRows.length === 0 ? (
                        <tr><td colSpan={2} className="px-6 py-10 text-center text-gray-400">Geen groepen gevonden</td></tr>
                      ) : (
                        groupRows.map((r, i) => {
                          const active = r.groupKey === selectedGroup
                          return (
                            <tr
                              key={r.groupKey}
                              onClick={() => { setSelectedGroup(r.groupKey); setSelectedBrand(''); setSelectedProduct(null) }}
                              className="cursor-pointer transition"
                              style={active ? { background: '#eef2ff' } : i % 2 === 0 ? { background: 'white' } : { background: '#fafafa' }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: active ? DYNAMO_BLUE : '#d1d5db' }} />
                                  <div>
                                    <div className="font-semibold text-gray-900">{r.groupLabel}</div>
                                    <div className="text-xs text-gray-400">{r.brandsCount} merken · {r.itemsCount} regels</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold" style={{ color: active ? DYNAMO_BLUE : '#374151' }}>
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

              {/* Merken */}
              <div className="rounded-[10px] shadow-sm overflow-hidden flex flex-col" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
                <div className="p-4 border-b border-gray-200" style={{ borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>2) Merken in groep</div>
                      <div className="text-sm text-gray-600">
                        {selectedGroupMeta ? (
                          <><span className="font-semibold text-gray-900">{selectedGroupMeta.groupLabel}</span> · {formatInt(selectedGroupMeta.availableTotal)} beschikbaar · {selectedGroupMeta.brandsCount} merken</>
                        ) : '—'}
                      </div>
                    </div>
                    <select
                      value={sortBrandsBy}
                      onChange={e => setSortBrandsBy(e.target.value as any)}
                      className="rounded-lg px-2 py-1.5 text-xs bg-white text-gray-900 border border-gray-300 focus:outline-none"
                      disabled={!selectedGroup}
                    >
                      <option value="available">Beschikbaar ↓</option>
                      <option value="name">Naam A-Z</option>
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                    <input
                      value={brandSearch}
                      onChange={e => setBrandSearch(e.target.value)}
                      placeholder="Zoek merk..."
                      className={inputClass + ' flex-1 min-w-0'}
                      disabled={!selectedGroup}
                    />
                    <input
                      type="number"
                      min={0}
                      value={minAvailable}
                      onChange={e => setMinAvailable(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="Min beschikbaar"
                      className={inputClass + ' w-full sm:w-36'}
                      disabled={!selectedGroup}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700 mt-2 cursor-pointer">
                    <input type="checkbox" checked={top10Brands} onChange={e => setTop10Brands(e.target.checked)} disabled={!selectedGroup} className="accent-[#2D457C]" />
                    <span>Toon alleen Top 10 merken</span>
                  </label>
                </div>

                <div className="overflow-auto flex-1" style={{ maxHeight: 480, WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm min-w-[280px]">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-white/85">Merk</th>
                        <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-white/85">Beschikbaar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-4 py-3"><div className="h-3 w-40 bg-gray-200 rounded" /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 bg-gray-200 rounded ml-auto" /></td>
                          </tr>
                        ))
                      ) : !selectedGroup ? (
                        <tr><td colSpan={2} className="px-6 py-10 text-center text-gray-400">Selecteer een groep</td></tr>
                      ) : brandRows.length === 0 ? (
                        <tr><td colSpan={2} className="px-6 py-10 text-center text-gray-400">Geen merken gevonden</td></tr>
                      ) : (
                        brandRows.map((r, i) => {
                          const active = r.brandKey === selectedBrand
                          const pct = maxBrandValue > 0 ? Math.round((r.availableTotal / maxBrandValue) * 100) : 0
                          return (
                            <tr
                              key={r.brandKey}
                              onClick={() => { setSelectedBrand(r.brandKey); setSelectedProduct(null) }}
                              className="cursor-pointer transition"
                              style={active ? { background: '#eef2ff' } : i % 2 === 0 ? { background: 'white' } : { background: '#fafafa' }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: active ? DYNAMO_BLUE : '#d1d5db' }} />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-900">{r.brandLabel}</div>
                                    <div className="mt-1 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: active ? DYNAMO_BLUE : 'rgba(45,69,124,0.3)' }} />
                                    </div>
                                    <div className="text-xs text-gray-400 mt-0.5">{r.itemsCount} regels</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold" style={{ color: active ? DYNAMO_BLUE : '#374151' }}>
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
            </div>

            {/* Producten + details */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4">
              <div className="rounded-[10px] shadow-sm overflow-hidden" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
                <div className="p-4 border-b border-gray-200" style={{ borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>3) Producten</div>
                      <div className="text-sm text-gray-600">
                        {selectedGroupMeta?.groupLabel ?? '—'} · <span className="font-semibold">{selectedBrandMeta?.brandLabel ?? '—'}</span>
                        {selectedBrand && <span className="text-gray-400"> · {formatInt(drilldownAvailableTotal)} beschikbaar · {productRows.length} regels · voorraad ≥ 1</span>}
                      </div>
                    </div>
                    {selectedBrand && (
                    <button onClick={() => { setSelectedBrand(''); setSelectedProduct(null) }} className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50">
                      Sluit
                    </button>
                  )}
                  </div>
                  {selectedBrand && (
                    <input
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Zoek product (omschrijving, SKU, barcode, leverancier)..."
                      className={inputClass + ' w-full'}
                    />
                  )}
                </div>

                <div className="overflow-auto" style={{ maxHeight: 480 }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-white/85">Product</th>
                        <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-white/85">Leverancier</th>
                        <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-white/85">Beschikbaar</th>
                        <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wide text-white/85">Voorraad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-4 py-3"><div className="h-3 w-64 bg-gray-200 rounded" /></td>
                            <td className="px-4 py-3"><div className="h-3 w-28 bg-gray-200 rounded" /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 bg-gray-200 rounded ml-auto" /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 bg-gray-200 rounded ml-auto" /></td>
                          </tr>
                        ))
                      ) : !selectedGroup || !selectedBrand ? (
                        <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">Kies een groep en merk om producten te zien</td></tr>
                      ) : productRows.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">Geen producten gevonden (voorraad ≥ 1)</td></tr>
                      ) : (
                        productRows.map((r, i) => {
                          const isSel =
                            selectedProduct?.supplierSku === r.supplierSku &&
                            selectedProduct?.barcode === r.barcode &&
                            selectedProduct?.description === r.description
                          return (
                            <tr
                              key={`${r.supplierSku}-${r.barcode}-${i}`}
                              onClick={() => setSelectedProduct(r)}
                              className="cursor-pointer transition"
                              style={isSel ? { background: '#eef2ff' } : i % 2 === 0 ? { background: 'white' } : { background: '#fafafa' }}
                            >
                              <td className="px-4 py-3 min-w-[280px]">
                                <div className="font-semibold text-gray-900">{r.description || '(Geen omschrijving)'}</div>
                                <div className="text-xs text-gray-400">SKU: {r.supplierSku || '—'} · Barcode: {r.barcode || '—'}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-700">{r.supplierNameLabel || '—'}</td>
                              <td className="px-4 py-3 text-right font-bold" style={{ color: r.available === 0 ? '#dc2626' : '#16a34a' }}>
                                {formatInt(r.available)}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700">{formatInt(r.stock)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Details */}
              <div className="rounded-[10px] shadow-sm overflow-hidden" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
                <div className="p-4 border-b border-gray-200 flex items-start justify-between gap-3" style={{ borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE }}>Product details</div>
                    <div className="text-xs text-gray-400">Klik op een product voor details</div>
                  </div>
                  {selectedProduct && (
                    <button onClick={() => setSelectedProduct(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50">
                      Sluiten
                    </button>
                  )}
                </div>

                {!selectedProduct ? (
                  <div className="p-6 text-sm text-gray-400 text-center py-12">
                    <div className="text-3xl mb-2">👆</div>
                    Klik op een product om details te zien
                  </div>
                ) : (
                  <div className="p-4 space-y-4">
                    <div>
                      <div className="text-sm font-bold text-gray-900">{selectedProduct.description || '(Geen omschrijving)'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{selectedBrandMeta?.brandLabel ?? '—'} · {selectedGroupMeta?.groupLabel ?? '—'}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Beschikbaar', value: formatInt(selectedProduct.available), color: selectedProduct.available === 0 ? '#dc2626' : '#16a34a' },
                        { label: 'Voorraad', value: formatInt(selectedProduct.stock), color: undefined },
                        { label: 'Barcode', value: selectedProduct.barcode || '—', color: undefined },
                        { label: 'Art. nummer', value: selectedProduct.supplierSku || '—', color: undefined },
                      ].map(c => (
                        <div key={c.label} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="text-xs text-gray-500">{c.label}</div>
                          <div className="mt-0.5 font-bold text-lg" style={{ color: c.color ?? DYNAMO_BLUE }}>{c.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Leverancier</div>
                        <div className="mt-0.5 font-semibold text-gray-900">{selectedProduct.supplierNameLabel || '—'}</div>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xs text-gray-500">Prijs incl. BTW</div>
                        <div className="mt-0.5 font-bold text-lg" style={{ color: DYNAMO_BLUE }}>
                          {!selectedProduct.priceInc ? '—' : formatMoney(selectedProduct.priceInc)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs font-bold mb-2" style={{ color: DYNAMO_BLUE }}>Alle velden</div>
                      <div className="space-y-1.5 text-xs text-gray-700">
                        {['BRAND_NAME','GROUP_DESCRIPTION_1','GROUP_DESCRIPTION_2','SUPPLIER_PRODUCT_NUMBER','BARCODE','AVAILABLE_STOCK','STOCK','SALES_PRICE_INC','SUPPLIER_NAME'].map(k => {
                          const isVenditGroup1 = k === 'GROUP_DESCRIPTION_1' && selectedProduct.raw?._source === 'vendit'
                          const val = isVenditGroup1 && selectedProduct.raw?.GROUP_DESCRIPTION_1_ORIGINAL != null
                            ? selectedProduct.raw.GROUP_DESCRIPTION_1_ORIGINAL
                            : selectedProduct.raw?.[k]
                          return (
                            <div key={k} className="flex items-start justify-between gap-2">
                              <span className="font-mono text-gray-400 shrink-0">{k}{isVenditGroup1 ? ' (volledig)' : ''}</span>
                              <span className="text-right break-all">{String(val ?? '—')}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}