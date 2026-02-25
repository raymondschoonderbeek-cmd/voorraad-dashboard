'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
}

type Product = { [key: string]: any }

/** =========================
 *  ALIASES (handmatig samenvoegen)
 *  - key is de genormaliseerde "brandKey" (dus zonder spaties)
 *  - value is de "canonical key" waar je op wilt groeperen
 *
 *  TIP: voeg hier rustig varianten toe zodra je ze ziet.
 ========================= */
const BRAND_ALIASES: Record<string, string> = {
  // voorbeelden:
  // 'dutchid': 'dutchid',
  // 'dutch-id' komt door normalizer al op 'dutchid' uit (spaties weg), dus meestal niet nodig

  // Van Raam varianten (worden toch al 'vanraam', maar als voorbeeld):
  vanraam: 'vanraam',

  // voeg hier jouw eigen samenvoegingen toe:
  // 'bat avus': 'batavus',  // let op: keys zijn zonder spaties, dus wordt 'batavus' vs 'batavus' -> niet nodig
}

/** =========================
 *  GENERIEKE NORMALIZER
 ========================= */

function normalizeKey(input: any, fallbackKey = '(onbekend)') {
  const raw = String(input ?? '').trim()
  if (!raw) return fallbackKey

  let cleaned = raw.toLowerCase()

  // accenten weg (ü -> u)
  cleaned = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // - en _ naar spatie
  cleaned = cleaned.replace(/[-_]+/g, ' ')

  // alles wat geen letter/cijfer/spatie is -> spatie
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ')

  // meerdere spaties samenvoegen
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned || fallbackKey
}

function toTitleCase(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function normalizeLabel(input: any, fallbackLabel = '(Onbekend)') {
  const fallbackKey = fallbackLabel.toLowerCase()
  const key = normalizeKey(input, fallbackKey)
  if (key === fallbackKey) return fallbackLabel
  return toTitleCase(key)
}

/** =========================
 *  BRAND NORMALISATIE (extra streng)
 *  - spaties eruit => "van raam" == "vanraam"
 *  - aliases toepassen => handmatige samenvoeging
 ========================= */

function normalizeBrandKey(input: any) {
  const base = normalizeKey(input, '(geen merk)')

  // spaties weg voor merk-key
  const noSpaces = base.replace(/\s+/g, '')

  // alias-map (als je later uitzonderingen toevoegt)
  return BRAND_ALIASES[noSpaces] ?? noSpaces
}

function normalizeBrandLabel(input: any) {
  // label netjes houden (spaties blijven)
  return normalizeLabel(input, '(Geen merk)')
}

/** ========================= */

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

type GroupRow = {
  groupKey: string
  groupLabel: string
  availableTotal: number
  itemsCount: number
  brandsCount: number
}

type BrandRow = {
  brandKey: string
  brandLabel: string
  availableTotal: number
  itemsCount: number
}

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

export default function GroupToBrandAvailablePage() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)

  const [producten, setProducten] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const [groupSearch, setGroupSearch] = useState('')
  const [brandSearch, setBrandSearch] = useState('')

  // keys i.p.v. labels
  const [selectedGroup, setSelectedGroup] = useState<string>('') // groupKey
  const [selectedBrand, setSelectedBrand] = useState<string>('') // brandKey
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

  useEffect(() => {
    haalWinkelsOp()
  }, [haalWinkelsOp])

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

  // 1) Groepen (links)
  const groupRows: GroupRow[] = useMemo(() => {
    const groupTotals = new Map<string, { label: string; available: number; items: number; brands: Set<string> }>()

    for (const p of producten) {
      const groupKey = normalizeKey(p.GROUP_DESCRIPTION_1, '(geen groep 1)')
      const groupLabel = normalizeLabel(p.GROUP_DESCRIPTION_1, '(Geen groep 1)')

      const brandKey = normalizeBrandKey(p.BRAND_NAME)
      const available = toNumber(p.AVAILABLE_STOCK)

      const entry =
        groupTotals.get(groupKey) ?? { label: groupLabel, available: 0, items: 0, brands: new Set<string>() }

      if (!entry.label) entry.label = groupLabel
      entry.available += available
      entry.items += 1
      entry.brands.add(brandKey)
      groupTotals.set(groupKey, entry)
    }

    let rows: GroupRow[] = Array.from(groupTotals.entries()).map(([groupKey, v]) => ({
      groupKey,
      groupLabel: v.label,
      availableTotal: v.available,
      itemsCount: v.items,
      brandsCount: v.brands.size,
    }))

    const needle = groupSearch.trim().toLowerCase()
    if (needle) rows = rows.filter(r => r.groupLabel.toLowerCase().includes(needle))

    rows.sort((a, b) => {
      if (sortGroupsBy === 'name') return a.groupLabel.localeCompare(b.groupLabel)
      return (b.availableTotal - a.availableTotal) || a.groupLabel.localeCompare(b.groupLabel)
    })

    return rows
  }, [producten, groupSearch, sortGroupsBy])

  // auto-selecteer grootste groep
  useEffect(() => {
    if (!selectedGroup && groupRows.length > 0) {
      setSelectedGroup(groupRows[0].groupKey)
      setSelectedBrand('')
      setSelectedProduct(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRows.length])

  // 2) Merken (rechts)
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
      if (!entry.label) entry.label = brandLabel

      entry.available += available
      entry.items += 1
      brandTotals.set(brandKey, entry)
    }

    let rows: BrandRow[] = Array.from(brandTotals.entries()).map(([brandKey, v]) => ({
      brandKey,
      brandLabel: v.label,
      availableTotal: v.available,
      itemsCount: v.items,
    }))

    const needle = brandSearch.trim().toLowerCase()
    if (needle) rows = rows.filter(r => r.brandLabel.toLowerCase().includes(needle))

    if (minAvailable > 0) rows = rows.filter(r => r.availableTotal >= minAvailable)

    rows.sort((a, b) => {
      if (sortBrandsBy === 'name') return a.brandLabel.localeCompare(b.brandLabel)
      return (b.availableTotal - a.availableTotal) || a.brandLabel.localeCompare(b.brandLabel)
    })

    if (top10Brands) rows = rows.slice(0, 10)

    return rows
  }, [producten, selectedGroup, brandSearch, sortBrandsBy, minAvailable, top10Brands])

  const selectedGroupMeta = useMemo(() => groupRows.find(r => r.groupKey === selectedGroup) ?? null, [groupRows, selectedGroup])
  const selectedBrandMeta = useMemo(() => brandRows.find(r => r.brandKey === selectedBrand) ?? null, [brandRows, selectedBrand])

  const maxBrandValue = useMemo(() => brandRows.reduce((m, r) => Math.max(m, r.availableTotal), 0), [brandRows])

  // 3) Drilldown producten
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

  useEffect(() => {
    setSelectedProduct(null)
  }, [selectedGroup, selectedBrand])

  const winkelLabel = geselecteerdeWinkel ? `${geselecteerdeWinkel.naam} (#${geselecteerdeWinkel.dealer_nummer})` : ''

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Beschikbare voorraad per merk</h1>
            <p className="text-sm text-gray-500">
              Selecteer een <span className="font-medium">groep 1</span>, klik op een <span className="font-medium">merk</span>, en klik op een product voor details. (som{' '}
              <span className="font-medium">AVAILABLE_STOCK</span>)
              {winkelLabel ? ` • ${winkelLabel}` : ''}
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

      {!geselecteerdeWinkel ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-gray-500">Kies een winkel om te starten.</div>
      ) : (
        <div className="space-y-4">
          {/* 2-koloms overzicht */}
          <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
            {/* LEFT: groups */}
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
                          <td className="px-4 py-3"><div className="h-3 w-48 bg-gray-200 rounded" /></td>
                          <td className="px-4 py-3 text-right"><div className="h-3 w-16 bg-gray-200 rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : groupRows.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-6 py-10 text-center text-gray-500">Geen groepen gevonden.</td>
                      </tr>
                    ) : (
                      groupRows.map((r, i) => {
                        const selected = r.groupKey === selectedGroup
                        return (
                          <tr
                            key={r.groupKey}
                            className={[
                              'cursor-pointer',
                              selected ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                              'hover:bg-blue-50/60',
                            ].join(' ')}
                            onClick={() => {
                              setSelectedGroup(r.groupKey)
                              setSelectedBrand('')
                              setSelectedProduct(null)
                            }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={['inline-flex w-2 h-2 rounded-full', selected ? 'bg-blue-600' : 'bg-gray-300'].join(' ')} />
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900 truncate">{r.groupLabel}</div>
                                  <div className="text-xs text-gray-500">{r.brandsCount} merken • {r.itemsCount} regels</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{formatInt(r.availableTotal)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT: brands */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800">2) Overzicht per merk</div>
                      <div className="text-sm text-gray-600 truncate">
                        Groep: <span className="font-semibold text-gray-900">{selectedGroupMeta?.groupLabel ?? '—'}</span>
                      </div>
                      {selectedGroupMeta && (
                        <div className="text-xs text-gray-500">
                          Totaal beschikbaar: <span className="font-semibold">{formatInt(selectedGroupMeta.availableTotal)}</span> • {selectedGroupMeta.brandsCount} merken
                        </div>
                      )}
                      {selectedBrand && (
                        <div className="text-xs text-gray-500 mt-1">
                          Geselecteerd merk: <span className="font-semibold text-gray-900">{selectedBrandMeta?.brandLabel ?? '—'}</span>
                        </div>
                      )}
                    </div>

                    <select
                      value={sortBrandsBy}
                      onChange={e => setSortBrandsBy(e.target.value as any)}
                      className="rounded-xl px-3 py-2 text-xs bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedGroup}
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

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={top10Brands} onChange={e => setTop10Brands(e.target.checked)} disabled={!selectedGroup} />
                    <span className="font-medium">Toon alleen Top 10 merken</span>
                  </label>
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
                          <td className="px-4 py-3"><div className="h-3 w-48 bg-gray-200 rounded" /></td>
                          <td className="px-4 py-3 text-right"><div className="h-3 w-16 bg-gray-200 rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : !selectedGroup ? (
                      <tr><td colSpan={2} className="px-6 py-10 text-center text-gray-500">Selecteer links een groep om merken te tonen.</td></tr>
                    ) : brandRows.length === 0 ? (
                      <tr><td colSpan={2} className="px-6 py-10 text-center text-gray-500">Geen merken gevonden (filter te streng?).</td></tr>
                    ) : (
                      brandRows.map((r, i) => {
                        const bg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                        const pct = maxBrandValue > 0 ? Math.round((r.availableTotal / maxBrandValue) * 100) : 0
                        const isSelected = r.brandKey === selectedBrand

                        return (
                          <tr
                            key={r.brandKey}
                            className={[bg, 'cursor-pointer hover:bg-blue-50/60', isSelected ? 'bg-blue-50' : ''].join(' ')}
                            onClick={() => {
                              setSelectedBrand(r.brandKey)
                              setSelectedProduct(null)
                            }}
                            title="Klik voor producten"
                          >
                            <td className="px-4 py-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={['inline-flex w-2 h-2 rounded-full', isSelected ? 'bg-blue-600' : 'bg-gray-300'].join(' ')} />
                                  <div className="font-semibold text-gray-900 truncate">{r.brandLabel}</div>
                                </div>
                                <div className="mt-1 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{r.itemsCount} regels</div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{formatInt(r.availableTotal)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* DRILLDOWN + DETAILS */}
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">3) Producten (drilldown)</div>
                  <div className="text-sm text-gray-600 truncate">
                    Groep: <span className="font-semibold text-gray-900">{selectedGroupMeta?.groupLabel ?? '—'}</span> • Merk:{' '}
                    <span className="font-semibold text-gray-900">{selectedBrandMeta?.brandLabel ?? '—'}</span>
                  </div>
                  {selectedBrand && (
                    <div className="text-xs text-gray-500">
                      Som beschikbaar in selectie: <span className="font-semibold">{formatInt(drilldownAvailableTotal)}</span> • {productRows.length} regels
                    </div>
                  )}
                </div>

                {selectedBrand && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBrand('')
                      setSelectedProduct(null)
                    }}
                    className="rounded-xl px-3 py-2 text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50"
                  >
                    Sluit
                  </button>
                )}
              </div>

              <div className="overflow-auto relative" style={{ maxHeight: 520 }}>
                <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                    <tr className="text-xs uppercase tracking-wide text-gray-700">
                      <th className="px-4 py-3 text-left font-semibold">Product</th>
                      <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Leverancier</th>
                      <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Beschikbaar</th>
                      <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">Voorraad</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-4 py-3"><div className="h-3 w-64 bg-gray-200 rounded" /></td>
                          <td className="px-4 py-3"><div className="h-3 w-28 bg-gray-200 rounded" /></td>
                          <td className="px-4 py-3 text-right"><div className="h-3 w-14 bg-gray-200 rounded ml-auto" /></td>
                          <td className="px-4 py-3 text-right"><div className="h-3 w-14 bg-gray-200 rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : !selectedGroup || !selectedBrand ? (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">Kies links een groep en klik rechts op een merk om producten te zien.</td></tr>
                    ) : productRows.length === 0 ? (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">Geen producten gevonden voor deze selectie.</td></tr>
                    ) : (
                      productRows.map((r, i) => {
                        const isSel =
                          selectedProduct?.supplierSku === r.supplierSku &&
                          selectedProduct?.barcode === r.barcode &&
                          selectedProduct?.description === r.description

                        return (
                          <tr
                            key={`${r.supplierSku}-${r.barcode}-${i}`}
                            className={[
                              i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
                              'cursor-pointer hover:bg-blue-50/60',
                              isSel ? 'bg-blue-50' : '',
                            ].join(' ')}
                            onClick={() => setSelectedProduct(r)}
                            title="Klik voor details"
                          >
                            <td className="px-4 py-3 min-w-[320px]">
                              <div className="font-semibold text-gray-900">{r.description || '(Geen omschrijving)'}</div>
                              <div className="text-xs text-gray-500">
                                SKU: {r.supplierSku || '—'} • Barcode: {r.barcode || '—'}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{r.supplierNameLabel || '—'}</td>
                            <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{formatInt(r.available)}</td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">{formatInt(r.stock)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800">Product details</div>
                  <div className="text-xs text-gray-500">Klik op een productregel om details te zien.</div>
                </div>

                {selectedProduct && (
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold bg-white border border-gray-300 hover:bg-gray-50"
                  >
                    Sluiten
                  </button>
                )}
              </div>

              {!selectedProduct ? (
                <div className="p-6 text-sm text-gray-500">Geen product geselecteerd.</div>
              ) : (
                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{selectedProduct.description || '(Geen omschrijving)'}</div>
                    <div className="text-xs text-gray-500">{selectedBrandMeta?.brandLabel ?? '—'} • {selectedGroupMeta?.groupLabel ?? '—'}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <InfoCard label="Beschikbaar" value={formatInt(selectedProduct.available)} strong />
                    <InfoCard label="Voorraad" value={formatInt(selectedProduct.stock)} />
                    <InfoCard label="Barcode" value={selectedProduct.barcode || '—'} />
                    <InfoCard label="Leverancier SKU" value={selectedProduct.supplierSku || '—'} />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <InfoCard label="Leverancier" value={selectedProduct.supplierNameLabel || '—'} />
                    <InfoCard
                      label="Prijs incl."
                      value={
                        selectedProduct.priceInc === null || selectedProduct.priceInc === undefined || selectedProduct.priceInc === ''
                          ? '—'
                          : formatMoney(selectedProduct.priceInc)
                      }
                    />
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">Raw velden (handig voor debug)</div>
                    <div className="grid grid-cols-1 gap-2 text-xs text-gray-700">
                      <KeyValue k="BRAND_NAME" v={selectedProduct.raw?.BRAND_NAME} />
                      <KeyValue k="GROUP_DESCRIPTION_1" v={selectedProduct.raw?.GROUP_DESCRIPTION_1} />
                      <KeyValue k="GROUP_DESCRIPTION_2" v={selectedProduct.raw?.GROUP_DESCRIPTION_2} />
                      <KeyValue k="SUPPLIER_PRODUCT_NUMBER" v={selectedProduct.raw?.SUPPLIER_PRODUCT_NUMBER} />
                      <KeyValue k="BARCODE" v={selectedProduct.raw?.BARCODE} />
                      <KeyValue k="AVAILABLE_STOCK" v={selectedProduct.raw?.AVAILABLE_STOCK} />
                      <KeyValue k="STOCK" v={selectedProduct.raw?.STOCK} />
                      <KeyValue k="SALES_PRICE_INC" v={selectedProduct.raw?.SALES_PRICE_INC} />
                      <KeyValue k="SUPPLIER_NAME" v={selectedProduct.raw?.SUPPLIER_NAME} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={['mt-1', strong ? 'text-lg font-bold text-gray-900' : 'text-sm font-semibold text-gray-900'].join(' ')}>
        {value}
      </div>
    </div>
  )
}

function KeyValue({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="font-mono text-[11px] text-gray-500">{k}</div>
      <div className="text-right break-all">{String(v ?? '—')}</div>
    </div>
  )
}