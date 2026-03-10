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

function DataTableView({ data }: { data: unknown[] }) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const item of data) {
      if (item && typeof item === 'object') Object.keys(item as object).forEach(k => keys.add(k))
    }
    return Array.from(keys).sort()
  }, [data])

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
                  <td key={col} className="px-3 py-2 max-w-[200px] truncate" title={cellValue(row, col)}>
                    {cellValue(row, col)}
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
  const [result, setResult] = useState<{ status?: number; statusText?: string; url?: string; data?: unknown; error?: string } | null>(null)

  const [scanResult, setScanResult] = useState<ScanResult[] | null>(null)
  const [scanning, setScanning] = useState(false)

  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState<{ customerOrderHeaderId?: number; customerOrderNumber?: string; creationDatetime?: string; customerId?: number; customerName?: string; orderStatusId?: number; [key: string]: unknown }[]>([])
  const [ordersTotalCount, setOrdersTotalCount] = useState(0)
  const [ordersPaginationOffset, setOrdersPaginationOffset] = useState(0)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [ordersSearch, setOrdersSearch] = useState('')
  const ORDERS_PAGE_SIZE = 100

  const [stockLoading, setStockLoading] = useState(false)
  const [stock, setStock] = useState<{ productId?: number; productName?: string; availableStock?: number; sizeColorId?: number; officeId?: number; [key: string]: unknown }[]>([])
  const [stockError, setStockError] = useState<string | null>(null)
  const [stockSearch, setStockSearch] = useState('')

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
    } finally {
      setScanning(false)
    }
  }

  async function loadOrders(offset: number) {
    if (!selectedWinkelId) return
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const res = await fetch('/api/vendit-orders-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winkel_id: selectedWinkelId, paginationOffset: offset }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOrdersError(data.error ?? `HTTP ${res.status}`)
        setOrders([])
      } else {
        setOrders(data.orders ?? [])
        setOrdersTotalCount(data.totalCount ?? 0)
        setOrdersPaginationOffset(data.paginationOffset ?? offset)
      }
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : 'Netwerkfout')
      setOrders([])
    }
    setOrdersLoading(false)
  }

  const ordersFiltered = useMemo(() => {
    if (!ordersSearch.trim()) return orders
    const q = ordersSearch.toLowerCase()
    return orders.filter(o => JSON.stringify(o).toLowerCase().includes(q))
  }, [orders, ordersSearch])

  async function loadStock() {
    if (!selectedWinkelId) return
    setStockLoading(true)
    setStockError(null)
    try {
      const res = await fetch('/api/vendit-stock-overview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winkel_id: selectedWinkelId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStockError(data.error ?? `HTTP ${res.status}`)
        setStock([])
      } else {
        setStock(data.stock ?? [])
      }
    } catch (err) {
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

  function formatOrderDate(s: string | undefined) {
    if (!s) return '—'
    try {
      const d = new Date(s)
      return isNaN(d.getTime()) ? s : d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return s
    }
  }

  async function runTest() {
    if (!selectedWinkelId || !selectedEndpoint) return
    setLoading(true)
    setResult(null)
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
      if (!res.ok) {
        setResult({ error: data.error ?? data.message ?? `HTTP ${res.status}` })
      } else {
        setResult(data)
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Netwerkfout' })
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
          <div className="flex flex-wrap items-center gap-3">
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
                  {ordersTotalCount} orders totaal · Pagina {Math.floor(ordersPaginationOffset / ORDERS_PAGE_SIZE) + 1}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    placeholder="Zoeken..."
                    value={ordersSearch}
                    onChange={e => setOrdersSearch(e.target.value)}
                    className="rounded-lg px-3 py-1.5 text-sm border"
                    style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', minWidth: 160 }}
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ color: '#0d1f4e' }}>
                  <thead>
                    <tr style={{ background: 'rgba(13,31,78,0.02)' }}>
                      <th className="px-3 py-2 text-left font-semibold">Order nr</th>
                      <th className="px-3 py-2 text-left font-semibold">Datum</th>
                      <th className="px-3 py-2 text-left font-semibold">Klant</th>
                      <th className="px-3 py-2 text-left font-semibold">Klant ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersFiltered.map((o, i) => (
                      <tr key={o.customerOrderHeaderId ?? i} className="border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                        <td className="px-3 py-2 font-mono">{o.customerOrderNumber ?? o.customerOrderHeaderId ?? '—'}</td>
                        <td className="px-3 py-2">{formatOrderDate(o.creationDatetime as string)}</td>
                        <td className="px-3 py-2 font-medium">{o.customerName ?? '—'}</td>
                        <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.5)' }}>{o.customerId ?? '—'}</td>
                        <td className="px-3 py-2">{o.orderStatusId != null ? String(o.orderStatusId) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ordersFiltered.length !== orders.length && (
                <div className="px-4 py-2 text-xs" style={{ color: 'rgba(13,31,78,0.5)', borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                  {ordersFiltered.length} van {orders.length} getoond (gefilterd)
                </div>
              )}
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
                  {stock.length} producten met voorraad
                </span>
                <input
                  type="search"
                  placeholder="Zoeken..."
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm border"
                  style={{ background: 'white', borderColor: 'rgba(13,31,78,0.12)', minWidth: 160 }}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ color: '#0d1f4e' }}>
                  <thead>
                    <tr style={{ background: 'rgba(13,31,78,0.02)' }}>
                      <th className="px-3 py-2 text-left font-semibold">Product</th>
                      <th className="px-3 py-2 text-left font-semibold">Product ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Beschikbaar</th>
                      <th className="px-3 py-2 text-left font-semibold">Variant</th>
                      <th className="px-3 py-2 text-left font-semibold">Vestiging</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockFiltered.map((s, i) => (
                      <tr key={`${s.productId}-${s.sizeColorId ?? 0}-${s.officeId ?? 0}-${i}`} className="border-t" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
                        <td className="px-3 py-2 font-medium">{s.productName ?? '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'rgba(13,31,78,0.5)' }}>{s.productId ?? '—'}</td>
                        <td className="px-3 py-2 font-semibold">{s.availableStock != null ? Number(s.availableStock) : '—'}</td>
                        <td className="px-3 py-2">{s.sizeColorId != null ? String(s.sizeColorId) : '—'}</td>
                        <td className="px-3 py-2">{s.officeId != null ? String(s.officeId) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stockFiltered.length !== stock.length && (
                <div className="px-4 py-2 text-xs" style={{ color: 'rgba(13,31,78,0.5)', borderTop: '1px solid rgba(13,31,78,0.08)' }}>
                  {stockFiltered.length} van {stock.length} getoond (gefilterd)
                </div>
              )}
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
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(13,31,78,0.04)', borderBottom: '1px solid rgba(13,31,78,0.08)' }}>
              <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Resultaat</span>
              {result.status != null && (
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${result.status >= 200 && result.status < 300 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {result.status} {result.statusText ?? ''}
                </span>
              )}
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
