'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'

type Winkel = { id: number; naam: string; dealer_nummer: string }
type Product = { [key: string]: any }

const BRAND_ALIASES: Record<string, string> = { vanraam: 'vanraam' }

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

function toTitleCase(s: string) { return s.replace(/\b\w/g, c => c.toUpperCase()) }

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

function normalizeBrandLabel(input: any) { return normalizeLabel(input, '(Geen merk)') }

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
type ProductRow = { description: string; supplierSku: string; barcode: string; supplierNameLabel: string; available: number; stock: number; priceInc: any; raw: Product }

export default function BrandGroepPage() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)
  const [producten, setProducten] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)
  const [sortGroupsBy, setSortGroupsBy] = useState<'available' | 'name'>('available')
  const [sortBrandsBy, setSortBrandsBy] = useState<'available' | 'name'>('available')
  const [minAvailable, setMinAvailable] = useState<number>(0)
  const [top10Brands, setTop10Brands] = useState<boolean>(false)

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

  useEffect(() => { haalWinkelsOp() }, [haalWinkelsOp])

  async function selecteerWinkel(id: number) {
    const winkel = winkels.find(w => w.id === id) ?? null
    setGeselecteerdeWinkel(winkel)
    setProducten([])
    setSelectedGroup('')
    setSelectedBrand('')
    setSelectedProduct(null)
    setGroupSearch('')
    setBrandSearch('')
    setMinAvailable(0)
    setTop10Brands(false)
    if (winkel) await haalVoorraadOp(winkel.dealer_nummer)
  }

  const groupRows: GroupRow[] = useMemo(() => {
    const groupTotals = new Map<string, { label: string; available: number; items: number; brands: Set<string> }>()
    for (const p of producten) {
      const groupKey = normalizeKey(p.GROUP_DESCRIPTION_1, '(geen groep 1)')
      const groupLabel = normalizeLabel(p.GROUP_DESCRIPTION_1, '(Geen groep 1)')
      const brandKey = normalizeBrandKey(p.BRAND_NAME)
      const available = toNumber(p.AVAILABLE_STOCK)
      const entry = groupTotals.get(groupKey) ?? { label: groupLabel, available: 0, items: 0, brands: new Set<string>() }
      entry.available += available
      entry.items += 1
      entry.brands.add(brandKey)
      groupTotals.set(groupKey, entry)
    }
    let rows: GroupRow[] = Array.from(groupTotals.entries()).map(([groupKey, v]) => ({
      groupKey, groupLabel: v.label, availableTotal: v.available, itemsCount: v.items, brandsCount: v.brands.size,
    }))
    const needle = groupSearch.trim().toLowerCase()
    if (needle) rows = rows.filter(r => r.groupLabel.toLowerCase().includes(needle))
    rows.sort((a, b) => sortGroupsBy === 'name' ? a.groupLabel.localeCompare(b.groupLabel) : (b.availableTotal - a.availableTotal) || a.groupLabel.localeCompare(b.groupLabel))
    return rows
  }, [producten, groupSearch, sortGroupsBy])

  useEffect(() => {
    if (!selectedGroup && groupRows.length > 0) {
      setSelectedGroup(groupRows[0].groupKey)
      setSelectedBrand('')
      setSelectedProduct(null)
    }
  }, [groupRows.length])

  const brandRows: BrandRow[] = useMemo(() => {
    if (!selectedGroup) return []
    const brandTotals = new Map<string, { label: string; available: number; items: number }>()
    for (const p of producten) {
      const groupKey = normalizeKey(p.GROUP_DESCRIPTION_1, '(geen groep 1)')
      if (groupKey !== selectedGroup) continue
      const brandKey = normalizeBrandKey(p.BRAND_NAME)
      const brandLabel = normalizeBrandLabel(p.BRAND_NAME)
      const available = toNumber(p.AVAILABLE_STOCK)
      const entry = brandTotals.get(brandKey) ?? { label: brandLabel, available: 0, items: 0 }
      entry.available += available
      entry.items += 1
      brandTotals.set(brandKey, entry)
    }
    let rows: BrandRow[] = Array.from(brandTotals.entries()).map(([brandKey, v]) => ({
      brandKey, brandLabel: v.label, availableTotal: v.available, itemsCount: v.items,
    }))
    const needle = brandSearch.trim().toLowerCase()
    if (needle) rows = rows.filter(r => r.brandLabel.toLowerCase().includes(needle))
    if (minAvailable > 0) rows = rows.filter(r => r.availableTotal >= minAvailable)
    rows.sort((a, b) => sortBrandsBy === 'name' ? a.brandLabel.localeCompare(b.brandLabel) : (b.availableTotal - a.availableTotal) || a.brandLabel.localeCompare(b.brandLabel))
    if (top10Brands) rows = rows.slice(0, 10)
    return rows
  }, [producten, selectedGroup, brandSearch, sortBrandsBy, minAvailable, top10Brands])

  const selectedGroupMeta = useMemo(() => groupRows.find(r => r.groupKey === selectedGroup) ?? null, [groupRows, selectedGroup])
  const selectedBrandMeta = useMemo(() => brandRows.find(r => r.brandKey === selectedBrand) ?? null, [brandRows, selectedBrand])
  const maxBrandValue = useMemo(() => brandRows.reduce((m, r) => Math.max(m, r.availableTotal), 0), [brandRows])

  const productRows: ProductRow[] = useMemo(() => {
    if (!selectedGroup || !selectedBrand) return []
    const rows: ProductRow[] = []
    for (const p of producten) {
      const groupKey = normalizeKey(p.GROUP_DESCRIPTION_1, '(geen groep 1)')
      if (groupKey !== selectedGroup) continue
      const brandKey = normalizeBrandKey(p.BRAND_NAME)
      if (brandKey !== selectedBrand) continue
      rows.push({
        description: String(p.PRODUCT_DESCRIPTION ?? '').trim(),
        supplierSku: String(p.SUPPLIER_PRODUCT_NUMBER ?? '').trim(),
        barcode: String(p.BARCODE ?? '').trim(),
        supplierNameLabel: normalizeLabel(p.SUPPLIER_NAME, '(Geen leverancier)'),
        available: toNumber(p.AVAILABLE_STOCK),
        stock: toNumber(p.STOCK),
        priceInc: p.SALES_PRICE_INC,
        raw: p,
      })
    }
    rows.sort((a, b) => (b.available - a.available) || a.description.localeCompare(b.description))
    return rows
  }, [producten, selectedGroup, selectedBrand])

  const drilldownAvailableTotal = useMemo(() => productRows.reduce((sum, r) => sum + (r.available || 0), 0), [productRows])

  useEffect(() => { setSelectedProduct(null) }, [selectedGroup, selectedBrand])

  const inputClass = "w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none"
  const inputStyle = { background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: "'Outfit', sans-serif" }

  const F = "'Outfit', sans-serif"

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb', fontFamily: F }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      {/* Navigatie */}
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-30">
        <div className="px-5 flex items-stretch gap-0" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>

          {/* Logo */}
          <div className="flex items-center gap-3 pr-6" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-base" style={{ background: DYNAMO_GOLD }}>
              <span style={{ color: DYNAMO_BLUE, fontFamily: F, fontWeight: 800 }}>D</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight" style={{ letterSpacing: '0.06em', fontFamily: F }}>DYNAMO</div>
              <div className="text-xs font-semibold leading-tight" style={{ color: DYNAMO_GOLD, letterSpacing: '0.12em', fontFamily: F }}>RETAIL GROUP</div>
            </div>
          </div>

          {/* Winkel switcher */}
          <div className="flex items-center px-5 gap-2" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-xs font-semibold uppercase hidden sm:block" style={{ color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', fontFamily: F }}>Winkel</span>
            <select
              value={geselecteerdeWinkel?.id ?? ''}
              onChange={e => selecteerWinkel(Number(e.target.value))}
              className="text-sm rounded-lg px-3 py-1.5 cursor-pointer min-w-[170px]"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F, outline: 'none' }}
            >
              <option value="" disabled className="text-gray-900">Kies winkel...</option>
              {winkels.map(w => (
                <option key={w.id} value={w.id} className="text-gray-900">{w.naam}</option>
              ))}
            </select>
          </div>

          {/* Paginatitel */}
          <div className="flex items-center px-5">
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: F }}>Merk / Groep</span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3 pl-5">
            <span className="text-xs hidden md:block" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: F }}>
              {loading ? 'Laden...' : geselecteerdeWinkel ? `${producten.length} producten` : ''}
            </span>
            <Link href="/dashboard" className="rounded-lg px-4 py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }}>
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-5 space-y-4 max-w-[1600px] mx-auto w-full">

        {!geselecteerdeWinkel ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: DYNAMO_BLUE }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={DYNAMO_GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-lg" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Kies een winkel</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(13,31,78,0.45)', fontFamily: F }}>Selecteer een winkel via de navigatie bovenin</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">

            {/* 2-koloms boven */}
            <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">

              {/* Groepen */}
              <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="p-4" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Groep</div>
                      <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Klik om te selecteren</div>
                    </div>
                    <select
                      value={sortGroupsBy}
                      onChange={e => setSortGroupsBy(e.target.value as any)}
                      className="rounded-lg px-2 py-1.5 text-xs"
                      style={{ background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                    >
                      <option value="available">Beschikbaar ↓</option>
                      <option value="name">Naam A-Z</option>
                    </select>
                  </div>
                  <input value={groupSearch} onChange={e => setGroupSearch(e.target.value)} placeholder="Zoek groep..." className={inputClass} style={inputStyle} />
                </div>
                <div className="overflow-auto flex-1" style={{ maxHeight: 440 }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Groep</th>
                        <th className="px-4 py-2.5 text-right" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Beschikbaar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                            <td className="px-4 py-3"><div className="h-3 w-40 rounded" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 rounded ml-auto" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                          </tr>
                        ))
                      ) : groupRows.length === 0 ? (
                        <tr><td colSpan={2} className="px-6 py-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Geen groepen gevonden</td></tr>
                      ) : (
                        groupRows.map((r, i) => {
                          const active = r.groupKey === selectedGroup
                          return (
                            <tr
                              key={r.groupKey}
                              onClick={() => { setSelectedGroup(r.groupKey); setSelectedBrand(''); setSelectedProduct(null) }}
                              className="cursor-pointer transition"
                              style={{ background: active ? 'rgba(13,31,78,0.06)' : i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.015)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? DYNAMO_BLUE : 'rgba(13,31,78,0.2)' }} />
                                  <div>
                                    <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.groupLabel}</div>
                                    <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{r.brandsCount} merken · {r.itemsCount} regels</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: active ? DYNAMO_BLUE : 'rgba(13,31,78,0.7)', fontFamily: F }}>{formatInt(r.availableTotal)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Merken */}
              <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="p-4" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_GOLD}` }}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Merken</div>
                      <div className="text-sm" style={{ color: 'rgba(13,31,78,0.5)', fontFamily: F }}>
                        {selectedGroupMeta ? (
                          <><span className="font-semibold" style={{ color: DYNAMO_BLUE }}>{selectedGroupMeta.groupLabel}</span> · {formatInt(selectedGroupMeta.availableTotal)} beschikbaar · {selectedGroupMeta.brandsCount} merken</>
                        ) : '—'}
                      </div>
                    </div>
                    <select
                      value={sortBrandsBy}
                      onChange={e => setSortBrandsBy(e.target.value as any)}
                      disabled={!selectedGroup}
                      className="rounded-lg px-2 py-1.5 text-xs"
                      style={{ background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                    >
                      <option value="available">Beschikbaar ↓</option>
                      <option value="name">Naam A-Z</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input value={brandSearch} onChange={e => setBrandSearch(e.target.value)} placeholder="Zoek merk..." className={inputClass + ' flex-1 min-w-[140px]'} style={inputStyle} disabled={!selectedGroup} />
                    <input type="number" min={0} value={minAvailable} onChange={e => setMinAvailable(Math.max(0, Number(e.target.value) || 0))} placeholder="Min beschikbaar" className="rounded-xl px-3 py-2 text-sm w-36" style={inputStyle} disabled={!selectedGroup} />
                  </div>
                  <label className="flex items-center gap-2 text-sm mt-2 cursor-pointer" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>
                    <input type="checkbox" checked={top10Brands} onChange={e => setTop10Brands(e.target.checked)} disabled={!selectedGroup} className="accent-blue-600" />
                    Top 10 merken
                  </label>
                </div>
                <div className="overflow-auto flex-1" style={{ maxHeight: 440 }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Merk</th>
                        <th className="px-4 py-2.5 text-right" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Beschikbaar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                            <td className="px-4 py-3"><div className="h-3 w-40 rounded" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 rounded ml-auto" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                          </tr>
                        ))
                      ) : !selectedGroup ? (
                        <tr><td colSpan={2} className="px-6 py-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Selecteer een groep</td></tr>
                      ) : brandRows.length === 0 ? (
                        <tr><td colSpan={2} className="px-6 py-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Geen merken gevonden</td></tr>
                      ) : (
                        brandRows.map((r, i) => {
                          const active = r.brandKey === selectedBrand
                          const pct = maxBrandValue > 0 ? Math.round((r.availableTotal / maxBrandValue) * 100) : 0
                          return (
                            <tr
                              key={r.brandKey}
                              onClick={() => { setSelectedBrand(r.brandKey); setSelectedProduct(null) }}
                              className="cursor-pointer transition"
                              style={{ background: active ? 'rgba(13,31,78,0.06)' : i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.015)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: active ? DYNAMO_BLUE : 'rgba(13,31,78,0.2)' }} />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.brandLabel}</div>
                                    <div className="mt-1.5 h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(13,31,78,0.07)' }}>
                                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: active ? DYNAMO_BLUE : DYNAMO_GOLD }} />
                                    </div>
                                    <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{r.itemsCount} regels</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: active ? DYNAMO_BLUE : 'rgba(13,31,78,0.7)', fontFamily: F }}>{formatInt(r.availableTotal)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Drilldown + details */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">

              {/* Producten */}
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="p-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Producten</div>
                    <div className="text-sm" style={{ color: 'rgba(13,31,78,0.5)', fontFamily: F }}>
                      {selectedGroupMeta?.groupLabel ?? '—'} · <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>{selectedBrandMeta?.brandLabel ?? '—'}</span>
                      {selectedBrand && <span style={{ color: 'rgba(13,31,78,0.4)' }}> · {formatInt(drilldownAvailableTotal)} beschikbaar · {productRows.length} regels</span>}
                    </div>
                  </div>
                  {selectedBrand && (
                    <button onClick={() => { setSelectedBrand(''); setSelectedProduct(null) }} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(13,31,78,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Sluit</button>
                  )}
                </div>
                <div className="overflow-auto" style={{ maxHeight: 480 }}>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10" style={{ background: DYNAMO_BLUE }}>
                      <tr>
                        <th className="px-4 py-2.5 text-left" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Product</th>
                        <th className="px-4 py-2.5 text-left" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Leverancier</th>
                        <th className="px-4 py-2.5 text-right" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Beschikbaar</th>
                        <th className="px-4 py-2.5 text-right" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: F }}>Voorraad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <tr key={i} className="animate-pulse" style={{ borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                            <td className="px-4 py-3"><div className="h-3 w-64 rounded" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                            <td className="px-4 py-3"><div className="h-3 w-28 rounded" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 rounded ml-auto" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                            <td className="px-4 py-3 text-right"><div className="h-3 w-12 rounded ml-auto" style={{ background: 'rgba(13,31,78,0.06)' }} /></td>
                          </tr>
                        ))
                      ) : !selectedGroup || !selectedBrand ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Kies een groep en merk om producten te zien</td></tr>
                      ) : productRows.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Geen producten gevonden</td></tr>
                      ) : (
                        productRows.map((r, i) => {
                          const isSel = selectedProduct?.supplierSku === r.supplierSku && selectedProduct?.barcode === r.barcode && selectedProduct?.description === r.description
                          return (
                            <tr
                              key={`${r.supplierSku}-${r.barcode}-${i}`}
                              onClick={() => setSelectedProduct(r)}
                              className="cursor-pointer transition"
                              style={{ background: isSel ? 'rgba(13,31,78,0.06)' : i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.015)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}
                            >
                              <td className="px-4 py-3 min-w-[280px]">
                                <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.description || '(Geen omschrijving)'}</div>
                                <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>SKU: {r.supplierSku || '—'} · {r.barcode || '—'}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.supplierNameLabel || '—'}</td>
                              <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: r.available === 0 ? '#dc2626' : '#16a34a', fontFamily: F }}>{formatInt(r.available)}</td>
                              <td className="px-4 py-3 text-right text-sm" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{formatInt(r.stock)}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Product details */}
              <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <div className="p-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_GOLD}` }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Product details</div>
                    <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Klik op een product voor details</div>
                  </div>
                  {selectedProduct && (
                    <button onClick={() => setSelectedProduct(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(13,31,78,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Sluiten</button>
                  )}
                </div>

                {!selectedProduct ? (
                  <div className="p-6 text-center py-16">
                    <div className="text-3xl mb-3">👆</div>
                    <p className="text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Klik op een product om details te zien</p>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    <div>
                      <div className="font-bold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{selectedProduct.description || '(Geen omschrijving)'}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{selectedBrandMeta?.brandLabel ?? '—'} · {selectedGroupMeta?.groupLabel ?? '—'}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Beschikbaar', value: formatInt(selectedProduct.available), color: selectedProduct.available === 0 ? '#dc2626' : '#16a34a' },
                        { label: 'Voorraad', value: formatInt(selectedProduct.stock), color: DYNAMO_BLUE },
                        { label: 'Barcode', value: selectedProduct.barcode || '—', color: DYNAMO_BLUE },
                        { label: 'Art. nummer', value: selectedProduct.supplierSku || '—', color: DYNAMO_BLUE },
                      ].map(c => (
                        <div key={c.label} className="rounded-xl p-3" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
                          <div className="text-xs mb-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{c.label}</div>
                          <div className="font-bold text-lg leading-tight" style={{ color: c.color, fontFamily: F }}>{c.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className="rounded-xl p-3" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
                        <div className="text-xs mb-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Leverancier</div>
                        <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{selectedProduct.supplierNameLabel || '—'}</div>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
                        <div className="text-xs mb-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Prijs incl. BTW</div>
                        <div className="font-bold text-lg" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          {!selectedProduct.priceInc ? '—' : formatMoney(selectedProduct.priceInc)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl p-3" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.07)' }}>
                      <div className="text-xs font-bold mb-2" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Alle velden</div>
                      <div className="space-y-1.5">
                        {['BRAND_NAME','GROUP_DESCRIPTION_1','GROUP_DESCRIPTION_2','SUPPLIER_PRODUCT_NUMBER','BARCODE','AVAILABLE_STOCK','STOCK','SALES_PRICE_INC','SUPPLIER_NAME'].map(k => (
                          <div key={k} className="flex items-start justify-between gap-2 text-xs">
                            <span className="font-mono shrink-0" style={{ color: 'rgba(13,31,78,0.35)' }}>{k}</span>
                            <span className="text-right break-all" style={{ color: 'rgba(13,31,78,0.7)', fontFamily: F }}>{String(selectedProduct.raw?.[k] ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
