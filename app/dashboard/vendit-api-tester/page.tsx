'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE } from '@/lib/theme'
import { VENDIT_GET_ENDPOINTS, VENDIT_DISCOVERY_ENDPOINTS } from '@/lib/vendit-api-endpoints'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const F = "'Outfit', sans-serif"

type ScanResult = { path: string; label: string; status: number; count: number | null; error?: string }

function extractArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const entries = Object.entries(data)
    if (entries.length === 1 && Array.isArray(entries[0][1])) return entries[0][1]
  }
  return null
}

const STOCK_PREFERRED_COLUMNS = [
  'productName', 'productNumber', 'articleNumber', 'barcode', 'brandName', 'groupName', 'kindDescription', 'productDescription', 'productSubdescription',
  'frameNumber', 'serialNumber', 'productSize', 'productColor', 'productType', 'modelSeason', 'productImageUrl',
  'availableStock', 'reserved', 'productStock', 'officeName', 'officeId', 'sizeColorId', 'productId',
  'purchasePriceEx', 'salesPriceEx', 'salesPriceInc', 'recommendedSalesPriceEx', 'recommendedSalesPriceInc',
]

function isImageUrlColumn(col: string) {
  return /imageurl|image_url|imageUrl|productImageUrl/i.test(col)
}

function isValidImageUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v.trim()) return false
  try {
    const u = new URL(v.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function ImageUrlCell({ url, onPreview }: { url: string; onPreview: () => void }) {
  const [thumbError, setThumbError] = useState(false)
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onPreview() }}
      className="inline-flex items-center gap-2 text-left min-w-0 hover:opacity-90 transition group rounded-lg p-1 -m-1 hover:bg-blue-50"
      title="Klik om afbeelding te bekijken"
    >
      <span className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-gray-100 flex items-center justify-center border border-gray-200 group-hover:border-blue-400 group-hover:ring-2 group-hover:ring-blue-200">
        {thumbError ? (
          <span className="text-gray-400 text-lg">🖼</span>
        ) : (
          <img src={url} alt="" className="w-full h-full object-cover" onError={() => setThumbError(true)} />
        )}
      </span>
      <span className="text-xs font-medium text-blue-600 group-hover:text-blue-700" style={{ maxWidth: 120 }}>Bekijk</span>
    </button>
  )
}

function ImageModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition font-bold text-lg"
          aria-label="Sluiten"
        >
          ✕
        </button>
        {error ? (
          <div className="rounded-xl px-8 py-6 bg-white/95 border border-red-200 text-red-700 text-sm shadow-xl">
            Afbeelding laden mislukt. De URL is mogelijk niet bereikbaar.
          </div>
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </div>
            )}
            <img
              src={url}
              alt="Productafbeelding"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              style={{ opacity: loaded ? 1 : 0.3, transition: 'opacity 0.2s' }}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
          </>
        )}
      </div>
    </div>
  )
}

function DataTableView({ data, preferredColumns }: { data: unknown[]; preferredColumns?: string[] }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null)
  const PAGE_SIZE = 25

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const item of data) {
      if (item && typeof item === 'object') Object.keys(item as object).forEach(k => keys.add(k))
    }
    const all = Array.from(keys)
    if (preferredColumns?.length) {
      const pref = new Set(preferredColumns)
      const ordered = preferredColumns.filter(c => all.includes(c))
      const rest = all.filter(c => !pref.has(c)).sort()
      return [...ordered, ...rest]
    }
    return all.sort()
  }, [data, preferredColumns])

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(row => {
      const s = JSON.stringify(row).toLowerCase()
      return s.includes(q)
    })
  }, [data, search])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = (a as Record<string, unknown>)?.[sortKey]
      const bv = (b as Record<string, unknown>)?.[sortKey]
      const aStr = av == null ? '' : String(av)
      const bStr = bv == null ? '' : String(bv)
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  const paginated = useMemo(() => {
    const start = page * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, page])
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const cellValue = (row: unknown, col: string) => {
    const v = (row as Record<string, unknown>)?.[col]
    if (v == null) return '—'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  const renderCell = (row: unknown, col: string) => {
    const v = (row as Record<string, unknown>)?.[col]
    const str = cellValue(row, col)
    if (isImageUrlColumn(col) && isValidImageUrl(v)) {
      const url = String(v).trim()
      return (
        <ImageUrlCell url={url} onPreview={() => setImageModalUrl(url)} />
      )
    }
    return str
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Zoeken in data..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          className="rounded-lg px-3 py-2 text-sm border"
          style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)', minWidth: 200 }}
        />
        <span className="text-xs" style={{ color: 'rgba(13,31,78,0.5)' }}>
          {filtered.length} van {data.length} rijen
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'rgba(13,31,78,0.12)' }}>
        <table className="w-full text-sm" style={{ color: '#0d1f4e' }}>
          <thead>
            <tr style={{ background: 'rgba(13,31,78,0.02)' }}>
              {columns.map(col => (
                <th
                  key={col}
                  className="px-3 py-2 text-left font-semibold cursor-pointer hover:bg-black/5 select-none"
                  onClick={() => {
                    setSortKey(k => (k === col ? k : col))
                    setSortDir(d => (sortKey === col ? (d === 'asc' ? 'desc' : 'asc') : 'asc'))
                  }}
                >
                  {col} {sortKey === col && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                {columns.map(col => (
                  <td key={col} className="px-3 py-2 max-w-[200px] align-middle" title={typeof renderCell(row, col) === 'string' ? String(renderCell(row, col)) : undefined}>
                    {renderCell(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(13,31,78,0.5)' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded disabled:opacity-50"
            style={{ background: 'rgba(13,31,78,0.06)' }}
          >
            ← Vorige
          </button>
          <span>Pagina {page + 1} van {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded disabled:opacity-50"
            style={{ background: 'rgba(13,31,78,0.06)' }}
          >
            Volgende →
          </button>
        </div>
      )}
      {imageModalUrl && (
        <ImageModal url={imageModalUrl} onClose={() => setImageModalUrl(null)} />
      )}
    </div>
  )
}

const DYNAMO_GOLD = '#f0c040'

type OrderWithDetails = {
  customerOrderNumber?: string
  customerOrderHeaderId?: number
  creationDatetime?: string
  customerId?: number
  customerName?: string
  orderStatusId?: number
  orderStatusName?: string
  orderDetails?: { items?: Record<string, unknown>[] }
  [key: string]: unknown
}

function formatOrderDate(s: string | undefined) {
  if (!s) return '—'
  try {
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return s
  }
}

function formatPrice(n: unknown) {
  if (n == null || n === '') return '—'
  const num = Number(n)
  return Number.isFinite(num) ? new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(num) : String(n)
}

function OrderCard({ order, collapsed, onToggle }: { order: OrderWithDetails; collapsed: boolean; onToggle: () => void }) {
  const od = order.orderDetails as { items?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined
  const items = Array.isArray(od) ? od : (od?.items ?? [])
  const orderNr = order.customerOrderNumber ?? String(order.customerOrderHeaderId ?? '—')
  const statusLabel = order.orderStatusName ?? (order.orderStatusId != null ? `Status ${order.orderStatusId}` : null)

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(13,31,78,0.12)', background: 'white', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
      {/* Order header - klikbaar om in/uit te klappen */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        className="px-4 py-3 flex flex-wrap items-center gap-4 cursor-pointer hover:opacity-95 transition"
        style={{ background: DYNAMO_BLUE }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.6)' }}>Order</span>
          <span className="font-bold text-lg" style={{ color: 'white', fontFamily: F }}>{orderNr}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
          <span>{formatOrderDate(order.creationDatetime as string)}</span>
          <span className="font-medium">{order.customerName ?? '—'}</span>
          {statusLabel && (
            <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(255,255,255,0.2)' }}>{statusLabel}</span>
          )}
        </div>
        <span className="ml-auto text-lg" style={{ color: 'rgba(255,255,255,0.8)' }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {/* Artikelregels */}
      {!collapsed && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: '#0d1f4e' }}>
          <thead>
            <tr style={{ background: 'rgba(13,31,78,0.03)' }}>
              <th className="px-4 py-2.5 text-left font-semibold">Product</th>
              <th className="px-4 py-2.5 text-left font-semibold">Art.nr</th>
              <th className="px-4 py-2.5 text-right font-semibold">Aantal</th>
              <th className="px-4 py-2.5 text-right font-semibold">Prijs excl.</th>
              <th className="px-4 py-2.5 text-right font-semibold">Totaal excl.</th>
              <th className="px-4 py-2.5 text-right font-semibold">Totaal incl.</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center" style={{ color: 'rgba(13,31,78,0.45)' }}>Geen artikelregels</td>
              </tr>
            ) : (
              items.map((item, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'rgba(13,31,78,0.06)' }}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium" style={{ color: DYNAMO_BLUE }}>{(item.productDescription as string) ?? '—'}</div>
                    {(item.productSubdescription as string) && (
                      <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.5)' }}>{item.productSubdescription as string}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'rgba(13,31,78,0.6)' }}>{(item.productNumber as string) ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{item.productQuantity != null ? Number(item.productQuantity) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">{formatPrice(item.productSalesPriceEx)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatPrice(item.productTotalSalesPriceEx)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatPrice(item.productTotalSalesPriceInc)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}

function Orderweergave({ orders, search }: { orders: OrderWithDetails[]; search: string }) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const toggleCollapsed = (key: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const filtered = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(o => {
      const orderNr = (o.customerOrderNumber ?? '').toLowerCase()
      const customer = (o.customerName ?? '').toLowerCase()
      const items = Array.isArray((o.orderDetails as { items?: unknown[] })?.items) ? (o.orderDetails as { items: unknown[] }).items : []
      const productMatch = items.some((it: unknown) => {
        const item = it as Record<string, unknown>
        const desc = String(item?.productDescription ?? '').toLowerCase()
        const nr = String(item?.productNumber ?? '').toLowerCase()
        return desc.includes(q) || nr.includes(q)
      })
      return orderNr.includes(q) || customer.includes(q) || productMatch
    })
  }, [orders, search])

  return (
    <div className="space-y-4">
      {filtered.map((o, i) => {
        const key = String(o.customerOrderNumber ?? o.customerOrderHeaderId ?? i)
        return (
          <OrderCard
            key={key}
            order={o}
            collapsed={collapsedIds.has(key)}
            onToggle={() => toggleCollapsed(key)}
          />
        )
      })}
    </div>
  )
}

export default function VenditApiTesterPage() {
  const { data: sessionData } = useSWR<{ isAdmin?: boolean }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const { data: gebruikersData, mutate: mutateGebruikers, isValidating: gebruikersValidating } = useSWR(
    isAdmin ? '/api/gebruikers' : null,
    (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json()),
    { revalidateOnFocus: true }
  )
  const winkels = (gebruikersData?.winkels ?? []) as { id: number; naam: string; api_type?: string; dealer_nummer?: string; has_vendit_api_credentials?: boolean }[]
  const venditWinkels = winkels.filter(w => w.api_type === 'vendit_api' && w.has_vendit_api_credentials === true)

  const [selectedWinkelId, setSelectedWinkelId] = useState<number | ''>('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [postBody, setPostBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status?: number; statusText?: string; url?: string; data?: unknown; error?: string; responseTime?: number } | null>(null)

  const [scanResult, setScanResult] = useState<ScanResult[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResponseTime, setScanResponseTime] = useState<number | null>(null)

  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState<{ customerOrderHeaderId?: number; customerOrderNumber?: string; creationDatetime?: string; customerId?: number; customerName?: string; orderStatusId?: number; [key: string]: unknown }[]>([])
  const [orderLines, setOrderLines] = useState<Record<string, unknown>[]>([])
  const [ordersIncludeDetails, setOrdersIncludeDetails] = useState(true)
  const [ordersViewMode, setOrdersViewMode] = useState<'orders' | 'tabel'>('orders')
  const [ordersTotalCount, setOrdersTotalCount] = useState(0)
  const [ordersPaginationOffset, setOrdersPaginationOffset] = useState(0)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [ordersSearch, setOrdersSearch] = useState('')
  const [ordersResponseTime, setOrdersResponseTime] = useState<number | null>(null)
  const [ordersDateFrom, setOrdersDateFrom] = useState('')
  const [ordersDateTo, setOrdersDateTo] = useState('')
  const ORDERS_PAGE_SIZE = 100

  const [stockLoading, setStockLoading] = useState(false)
  const [stock, setStock] = useState<{ productId?: number; productName?: string; availableStock?: number; sizeColorId?: number; officeId?: number; [key: string]: unknown }[]>([])
  const [stockError, setStockError] = useState<string | null>(null)
  const [stockSearch, setStockSearch] = useState('')
  const [stockResponseTime, setStockResponseTime] = useState<number | null>(null)

  const endpoint = VENDIT_GET_ENDPOINTS.find(e => e.path === selectedEndpoint)
  const hasParams = (endpoint?.params?.length ?? 0) > 0

  useEffect(() => {
    if (endpoint?.params) {
      setParams(prev => {
        const next = { ...prev }
        for (const p of endpoint.params) {
          if (!(p.name in next)) next[p.name] = ''
        }
        return next
      })
    } else {
      setParams({})
    }
  }, [selectedEndpoint, endpoint?.params])

  useEffect(() => {
    if (endpoint?.method === 'POST' && endpoint?.bodyPlaceholder) {
      setPostBody(endpoint.bodyPlaceholder)
    } else {
      setPostBody('')
    }
  }, [selectedEndpoint, endpoint?.method, endpoint?.bodyPlaceholder])

  async function runScan() {
    if (!selectedWinkelId) return
    setScanning(true)
    setScanResult(null)
    setScanResponseTime(null)
    const t0 = performance.now()
    try {
      const results: ScanResult[] = await Promise.all(
        VENDIT_DISCOVERY_ENDPOINTS.map(async ep => {
          try {
            const res = await fetch('/api/vendit-api-test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ winkel_id: selectedWinkelId, path: ep.path }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              return { path: ep.path, label: ep.label, status: res.status, count: null, error: data.error ?? data.message }
            }
            const arr = extractArray(data.data)
            const count = arr ? arr.length : null
            return { path: ep.path, label: ep.label, status: data.status ?? res.status, count, error: undefined }
          } catch (err) {
            return { path: ep.path, label: ep.label, status: 0, count: null, error: err instanceof Error ? err.message : 'Netwerkfout' }
          }
        })
      )
      setScanResult(results)
      setScanResponseTime(Math.round(performance.now() - t0))
    } finally {
      setScanning(false)
    }
  }

  async function loadOrders(offset: number) {
    if (!selectedWinkelId) return
    setOrdersLoading(true)
    setOrdersError(null)
    setOrdersResponseTime(null)
    const t0 = performance.now()
    try {
      const res = await fetch('/api/vendit-orders-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winkel_id: selectedWinkelId,
          paginationOffset: offset,
          includeDetails: ordersIncludeDetails,
          dateFrom: ordersDateFrom || undefined,
          dateTo: ordersDateTo || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      setOrdersResponseTime(Math.round(performance.now() - t0))
      if (!res.ok) {
        setOrdersError(data.error ?? `HTTP ${res.status}`)
        setOrders([])
        setOrderLines([])
      } else {
        setOrders(data.orders ?? [])
        setOrderLines(data.orderLines ?? [])
        setOrdersTotalCount(data.totalCount ?? 0)
        setOrdersPaginationOffset(data.paginationOffset ?? offset)
      }
    } catch (err) {
      setOrdersResponseTime(Math.round(performance.now() - t0))
      setOrdersError(err instanceof Error ? err.message : 'Netwerkfout')
      setOrders([])
      setOrderLines([])
    }
    setOrdersLoading(false)
  }

  const ordersDisplayData = orderLines.length > 0 ? orderLines : orders
  const ordersFiltered = useMemo(() => {
    if (!ordersSearch.trim()) return ordersDisplayData
    const q = ordersSearch.toLowerCase()
    return ordersDisplayData.filter(o => JSON.stringify(o).toLowerCase().includes(q))
  }, [ordersDisplayData, ordersSearch])

  async function loadStock() {
    if (!selectedWinkelId) return
    setStockLoading(true)
    setStockError(null)
    setStockResponseTime(null)
    const t0 = performance.now()
    try {
      const res = await fetch('/api/vendit-stock-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winkel_id: selectedWinkelId }),
      })
      const data = await res.json().catch(() => ({}))
      setStockResponseTime(Math.round(performance.now() - t0))
      if (!res.ok) {
        setStockError(data.error ?? `HTTP ${res.status}`)
        setStock([])
      } else {
        setStock(data.stock ?? [])
      }
    } catch (err) {
      setStockResponseTime(Math.round(performance.now() - t0))
      setStockError(err instanceof Error ? err.message : 'Netwerkfout')
      setStock([])
    }
    setStockLoading(false)
  }

  const stockFiltered = useMemo(() => {
    if (!stockSearch.trim()) return stock
    const q = stockSearch.toLowerCase()
    return stock.filter(s => JSON.stringify(s).toLowerCase().includes(q))
  }, [stock, stockSearch])

  async function runTest() {
    if (!selectedWinkelId || !selectedEndpoint) return
    setLoading(true)
    setResult(null)
    const t0 = performance.now()
    try {
      const res = await fetch('/api/vendit-api-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winkel_id: selectedWinkelId,
          path: selectedEndpoint,
          params: endpoint?.params?.length ? params : undefined,
          method: endpoint?.method,
          body: endpoint?.method === 'POST' && postBody.trim() ? postBody.trim() : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      const responseTime = Math.round(performance.now() - t0)
      if (!res.ok) {
        setResult({ error: data.error ?? data.message ?? `HTTP ${res.status}`, responseTime })
      } else {
        setResult({ ...data, responseTime })
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Netwerkfout', responseTime: Math.round(performance.now() - t0) })
    }
    setLoading(false)
  }

  const resultArray = result?.data ? extractArray(result.data) : null

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#f4f6fb', fontFamily: F }}>
        <p className="text-sm font-medium" style={{ color: 'rgba(13,31,78,0.6)' }}>Alleen admins hebben toegang tot de Vendit API Tester.</p>
        <Link href="/dashboard" className="mt-4 text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>← Terug naar Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f4f6fb', fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-white font-bold hover:opacity-90">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#f0c040', color: DYNAMO_BLUE }}>D</span>
            Vendit API Tester
          </Link>
          <div className="flex items-center gap-3">
            <a href="https://api2.vendit.online/VenditPublicApiSpec/index.html" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }}>
              API Docs
            </a>
            <Link href="/dashboard/beheer" className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }}>
              Beheer
            </Link>
            <Link href="/dashboard" className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>← Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Gedeelde winkelkeuze */}
        <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: 'rgba(13,31,78,0.6)' }}>Winkel</label>
              <select
                value={selectedWinkelId}
                onChange={e => setSelectedWinkelId(e.target.value ? Number(e.target.value) : '')}
                className="rounded-xl px-3 py-2.5 text-sm border"
                style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)', color: DYNAMO_BLUE, minWidth: 220 }}
              >
                <option value="">— Selecteer winkel —</option>
                {venditWinkels.map(w => (
                  <option key={w.id} value={w.id}>{w.naam} (#{w.dealer_nummer})</option>
                ))}
                {venditWinkels.length === 0 && (
                  <option value="" disabled>Geen Vendit API-winkels. Sla de winkel op in Beheer en klik op Ververs.</option>
                )}
              </select>
            </div>
            <button
              type="button"
              onClick={async () => {
                await mutateGebruikers(undefined, { revalidate: true })
              }}
              disabled={gebruikersValidating}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
              style={{ background: 'rgba(13,31,78,0.06)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.12)' }}
            >
              {gebruikersValidating ? 'Verversen...' : 'Ververs'}
            </button>
          </div>
          {venditWinkels.length === 0 && (
            <p className="mt-3 text-xs" style={{ color: 'rgba(13,31,78,0.5)' }}>
              Zorg dat de winkel systeem &quot;Vendit API&quot; heeft, alle drie de credentials zijn ingevuld, en je op <strong>Opslaan</strong> hebt geklikt in Beheer.
            </p>
          )}
        </div>

        {/* Orders overzicht */}
        <div className="rounded-2xl p-4 sm:p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
          <h2 className="text-base font-bold mb-2" style={{ color: DYNAMO_BLUE }}>Orders overzicht (met klanten)</h2>
          <p className="text-sm mb-4" style={{ color: 'rgba(13,31,78,0.5)' }}>
            Haal alle orders op met klantnamen voor de geselecteerde winkel.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ordersIncludeDetails}
                onChange={e => setOrdersIncludeDetails(e.target.checked)}
                className="rounded accent-blue-600"
              />
              <span className="text-sm font-medium" style={{ color: 'rgba(13,31,78,0.8)' }}>Inclusief artikel details</span>
            </label>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium" style={{ color: 'rgba(13,31,78,0.6)' }}>Vanaf</label>
              <input
                type="date"
                value={ordersDateFrom}
                onChange={e => setOrdersDateFrom(e.target.value)}
                className="rounded-lg px-2.5 py-1.5 text-sm border"
                style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)' }}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium" style={{ color: 'rgba(13,31,78,0.6)' }}>Tot</label>
              <input
                type="date"
                value={ordersDateTo}
                onChange={e => setOrdersDateTo(e.target.value)}
                className="rounded-lg px-2.5 py-1.5 text-sm border"
                style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)' }}
              />
            </div>
            <button
              onClick={() => loadOrders(0)}
              disabled={ordersLoading || !selectedWinkelId}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
              style={{ background: DYNAMO_BLUE, color: 'white' }}
            >
              {ordersLoading ? 'Laden...' : 'Orders ophalen'}
            </button>
          </div>
          {ordersError && (
            <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
              {ordersError}
            </div>
          )}
          {orders.length > 0 && (
            <div className="mt-4 rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(13,31,78,0.12)' }}>
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: 'rgba(13,31,78,0.04)', borderBottom: '1px solid rgba(13,31,78,0.08)' }}>
                <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
                  {ordersTotalCount} orders totaal
                  {orderLines.length > 0 && ` · ${orderLines.length} regels (artikelen)`}
                  {' · Pagina '}{Math.floor(ordersPaginationOffset / ORDERS_PAGE_SIZE) + 1}
                  {ordersResponseTime != null && (
                    <span className="ml-2 font-normal" style={{ color: 'rgba(13,31,78,0.5)' }}>({ordersResponseTime} ms)</span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {orderLines.length > 0 && (
                    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'rgba(13,31,78,0.12)' }}>
                      <button
                        onClick={() => setOrdersViewMode('orders')}
                        className="px-3 py-1.5 text-xs font-semibold transition"
                        style={{
                          background: ordersViewMode === 'orders' ? DYNAMO_BLUE : 'white',
                          color: ordersViewMode === 'orders' ? 'white' : 'rgba(13,31,78,0.6)',
                        }}
                      >
                        Orderweergave
                      </button>
                      <button
                        onClick={() => setOrdersViewMode('tabel')}
                        className="px-3 py-1.5 text-xs font-semibold transition"
                        style={{
                          background: ordersViewMode === 'tabel' ? DYNAMO_BLUE : 'white',
                          color: ordersViewMode === 'tabel' ? 'white' : 'rgba(13,31,78,0.6)',
                        }}
                      >
                        Tabel
                      </button>
                    </div>
                  )}
                  <input
                    type="search"
                    placeholder="Zoeken op ordernr, klant, product..."
                    value={ordersSearch}
                    onChange={e => setOrdersSearch(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-sm border"
                    style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', minWidth: 200 }}
                  />
                  <button
                    onClick={() => loadOrders(Math.max(0, ordersPaginationOffset - ORDERS_PAGE_SIZE))}
                    disabled={ordersLoading || ordersPaginationOffset === 0}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: 'rgba(13,31,78,0.06)', color: DYNAMO_BLUE }}
                  >
                    ← Vorige
                  </button>
                  <button
                    onClick={() => loadOrders(ordersPaginationOffset + ORDERS_PAGE_SIZE)}
                    disabled={ordersLoading || orders.length < ORDERS_PAGE_SIZE}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: 'rgba(13,31,78,0.06)', color: DYNAMO_BLUE }}
                  >
                    Volgende →
                  </button>
                </div>
              </div>
              <div className="p-4">
                {orderLines.length > 0 && ordersViewMode === 'orders' ? (
                  <Orderweergave orders={orders as OrderWithDetails[]} search={ordersSearch} />
                ) : (
                  <DataTableView data={ordersFiltered} />
                )}
              </div>
              {ordersViewMode === 'tabel' && ordersFiltered.length !== ordersDisplayData.length && (
                <div className="px-4 py-2 text-xs" style={{ color: 'rgba(13,31,78,0.5)', borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                  {ordersFiltered.length} van {ordersDisplayData.length} getoond (gefilterd)
                </div>
              )}
              <details className="border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                <summary className="px-4 py-3 text-xs font-semibold cursor-pointer hover:bg-black/5" style={{ color: 'rgba(13,31,78,0.6)' }}>
                  Raw JSON (alle velden en details)
                </summary>
                <pre className="px-4 py-3 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto" style={{ background: 'rgba(13,31,78,0.02)', color: 'rgba(13,31,78,0.85)' }}>
                  {JSON.stringify(ordersViewMode === 'orders' ? orders : ordersFiltered, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Voorraad overzicht */}
        <div className="rounded-2xl p-4 sm:p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
          <h2 className="text-base font-bold mb-2" style={{ color: DYNAMO_BLUE }}>Voorraad overzicht (producten op voorraad)</h2>
          <p className="text-sm mb-4" style={{ color: 'rgba(13,31,78,0.5)' }}>
            Haal alle producten met voorraad op voor de geselecteerde winkel.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={loadStock}
              disabled={stockLoading || !selectedWinkelId}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
              style={{ background: DYNAMO_BLUE, color: 'white' }}
            >
              {stockLoading ? 'Laden...' : 'Voorraad ophalen'}
            </button>
          </div>
          {stockError && (
            <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
              {stockError}
            </div>
          )}
          {stock.length > 0 && (
            <div className="mt-4 rounded-xl overflow-hidden border" style={{ borderColor: 'rgba(13,31,78,0.12)' }}>
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: 'rgba(13,31,78,0.04)', borderBottom: '1px solid rgba(13,31,78,0.08)' }}>
                <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
                  {stock.length} voorraadregels
                  {stockResponseTime != null && (
                    <span className="ml-2 font-normal" style={{ color: 'rgba(13,31,78,0.5)' }}>({stockResponseTime} ms)</span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    placeholder="Zoeken op product, ID, vestiging..."
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-sm border"
                    style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', minWidth: 200 }}
                  />
                </div>
              </div>
              <div className="p-4">
                <DataTableView data={stockFiltered} preferredColumns={STOCK_PREFERRED_COLUMNS} />
              </div>
              {stockFiltered.length !== stock.length && (
                <div className="px-4 py-2 text-xs" style={{ color: 'rgba(13,31,78,0.5)', borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                  {stockFiltered.length} van {stock.length} getoond (gefilterd)
                </div>
              )}
              <details className="border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                <summary className="px-4 py-3 text-xs font-semibold cursor-pointer hover:bg-black/5" style={{ color: 'rgba(13,31,78,0.6)' }}>
                  Raw JSON (alle velden en details)
                </summary>
                <pre className="px-4 py-3 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto" style={{ background: 'rgba(13,31,78,0.02)', color: 'rgba(13,31,78,0.85)' }}>
                  {JSON.stringify(stockFiltered, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        {/* Discovery scan */}
        <div className="rounded-2xl p-4 sm:p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
          <h2 className="text-base font-bold mb-2" style={{ color: DYNAMO_BLUE }}>Data-overzicht (Discovery scan)</h2>
          <p className="text-sm mb-4" style={{ color: 'rgba(13,31,78,0.5)' }}>
            Scan alle GetAll-endpoints voor de geselecteerde winkel om snel te zien welke data beschikbaar is (aantal records per endpoint).
          </p>
          <button
            onClick={runScan}
            disabled={scanning || !selectedWinkelId}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{ background: DYNAMO_BLUE, color: 'white' }}
          >
            {scanning ? 'Scannen...' : 'Scan endpoints'}
          </button>
          {scanResponseTime != null && !scanning && (
            <span className="text-sm" style={{ color: 'rgba(13,31,78,0.5)' }}>{scanResponseTime} ms</span>
          )}
          {scanResult && (
            <div className="mt-4 overflow-x-auto rounded-lg border" style={{ borderColor: 'rgba(13,31,78,0.12)' }}>
              <table className="w-full text-sm" style={{ color: '#0d1f4e' }}>
                <thead>
                  <tr style={{ background: 'rgba(13,31,78,0.04)' }}>
                    <th className="px-3 py-2 text-left font-semibold">Endpoint</th>
                    <th className="px-3 py-2 text-left font-semibold">Aantal</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.map((r, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                      <td className="px-3 py-2 font-mono text-xs">{r.label}</td>
                      <td className="px-3 py-2">{r.count != null ? r.count : '—'}</td>
                      <td className="px-3 py-2">
                        {r.status >= 200 && r.status < 300 ? (
                          <span className="text-green-600 font-medium">✓</span>
                        ) : (
                          <span className="text-red-600 text-xs" title={r.error}>{r.error ?? `HTTP ${r.status}`}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4 sm:p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
          <h1 className="text-lg font-bold mb-4" style={{ color: DYNAMO_BLUE }}>Vendit Public API testen</h1>
          <p className="text-sm mb-6" style={{ color: 'rgba(13,31,78,0.5)' }}>
            Selecteer een Vendit-winkel met geconfigureerde API-credentials en een endpoint. Vul eventuele parameters of request body in en voer de call uit.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(13,31,78,0.6)' }}>Endpoint</label>
              <select
                value={selectedEndpoint}
                onChange={e => setSelectedEndpoint(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm border"
                style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)', color: DYNAMO_BLUE }}
              >
                <option value="">— Selecteer endpoint —</option>
                {VENDIT_GET_ENDPOINTS.map(ep => (
                  <option key={ep.path} value={ep.path}>{ep.label}</option>
                ))}
              </select>
            </div>

            {endpoint?.method === 'POST' && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(13,31,78,0.6)' }}>Request body (JSON)</label>
                <textarea
                  placeholder={endpoint?.bodyPlaceholder}
                  value={postBody}
                  onChange={e => setPostBody(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg px-3 py-2 text-sm font-mono border"
                  style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)' }}
                />
              </div>
            )}

            {hasParams && endpoint?.params && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold" style={{ color: 'rgba(13,31,78,0.6)' }}>Parameters</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {endpoint.params.map(p => (
                    <div key={p.name}>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(13,31,78,0.45)' }}>{p.name}</label>
                      <input
                        type="text"
                        placeholder={p.placeholder}
                        value={params[p.name] ?? ''}
                        onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-sm border"
                        style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={runTest}
              disabled={loading || !selectedWinkelId || !selectedEndpoint}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
              style={{ background: DYNAMO_BLUE, color: 'white' }}
            >
              {loading ? 'Bezig...' : 'Uitvoeren'}
            </button>
          </div>
        </div>

        {result && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ background: 'rgba(13,31,78,0.04)', borderBottom: '1px solid rgba(13,31,78,0.08)' }}>
              <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Resultaat</span>
              <div className="flex items-center gap-2">
                {result.responseTime != null && (
                  <span className="text-xs" style={{ color: 'rgba(13,31,78,0.5)' }}>{result.responseTime} ms</span>
                )}
                {result.status != null && (
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${result.status >= 200 && result.status < 300 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {result.status} {result.statusText ?? ''}
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 overflow-x-auto">
              {result.error ? (
                <p className="text-sm" style={{ color: '#dc2626' }}>{result.error}</p>
              ) : (
                <>
                  {result.url && (
                    <p className="text-xs font-mono mb-3 truncate" style={{ color: 'rgba(13,31,78,0.5)' }} title={result.url}>{result.url}</p>
                  )}
                  {resultArray ? (
                    <DataTableView data={resultArray} />
                  ) : null}
                  {resultArray && (
                    <details className="mt-4">
                      <summary className="text-xs font-semibold cursor-pointer" style={{ color: 'rgba(13,31,78,0.6)' }}>Raw JSON</summary>
                      <pre className="mt-2 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto p-3 rounded-lg" style={{ background: 'rgba(13,31,78,0.03)', color: 'rgba(13,31,78,0.85)' }}>
                        {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
                      </pre>
                    </details>
                  )}
                  {!resultArray && (
                    <pre className="text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto p-3 rounded-lg" style={{ background: 'rgba(13,31,78,0.03)', color: 'rgba(13,31,78,0.85)' }}>
                      {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
