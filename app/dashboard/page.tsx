'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/* =========================
   COLUMN CONFIG (BEST PRACTICE)
========================= */

const COLUMN_CONFIG: Record<
  string,
  {
    label?: string
    hidden?: boolean
    order?: number
    sticky?: boolean
    format?: 'money' | 'int' | 'text'
  }
> = {
  PRODUCT_DESCRIPTION: { label: 'Product', order: 10, sticky: true },
  BRAND_NAME: { label: 'Merk', order: 20 },
  BARCODE: { label: 'Barcode', order: 30 },
  SUPPLIER_PRODUCT_NUMBER: { label: 'Leverancier SKU', order: 40 },
  STOCK: { label: 'Voorraad', order: 50, format: 'int' },
  AVAILABLE_STOCK: { label: 'Beschikbaar', order: 60, format: 'int' },
  SALES_PRICE_INC: { label: 'Prijs incl.', order: 70, format: 'money' },
  GROUP_DESCRIPTION_1: { label: 'Groep 1', order: 80 },
  GROUP_DESCRIPTION_2: { label: 'Groep 2', order: 90 },
  SUPPLIER_NAME: { label: 'Leverancier', order: 100 },
}

function columnLabel(key: string) {
  return COLUMN_CONFIG[key]?.label ?? key.replace(/_/g, ' ')
}

function columnOrder(key: string) {
  return COLUMN_CONFIG[key]?.order ?? 1000
}

function isHidden(key: string) {
  return COLUMN_CONFIG[key]?.hidden ?? false
}

function isSticky(key: string) {
  return COLUMN_CONFIG[key]?.sticky ?? false
}

function formatValue(key: string, value: any) {
  if (value === null || value === undefined) return ''

  const format = COLUMN_CONFIG[key]?.format ?? 'text'

  if (format === 'int') {
    const n = Number(value)
    return Number.isFinite(n) ? Math.trunc(n).toString() : String(value)
  }

  if (format === 'money') {
    const n = Number(value)
    if (!Number.isFinite(n)) return String(value)
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(n)
  }

  return String(value)
}

/* ========================= */

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
}

type Product = {
  [key: string]: any
}

type SortDir = 'asc' | 'desc'

export default function Dashboard() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)

  const [producten, setProducten] = useState<Product[]>([])
  const [kolommen, setKolommen] = useState<string[]>([])
  const [zichtbareKolommen, setZichtbareKolommen] = useState<string[]>([])

  const [zoekterm, setZoekterm] = useState('')
  const [debouncedZoekterm, setDebouncedZoekterm] = useState('')
  const [zoekKolom, setZoekKolom] = useState('ALL')

  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  /* =========================
     DATA
  ========================= */

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

    const keys = items.length > 0 ? Object.keys(items[0]) : []

    const dynamicCols = keys
      .filter(k => !isHidden(k))
      .sort((a, b) => {
        const oa = columnOrder(a)
        const ob = columnOrder(b)
        if (oa !== ob) return oa - ob
        return a.localeCompare(b)
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
  }, [haalWinkelsOp])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedZoekterm(zoekterm), 400)
    return () => clearTimeout(t)
  }, [zoekterm])

  useEffect(() => {
    if (!geselecteerdeWinkel) return
    haalVoorraadOp(geselecteerdeWinkel.dealer_nummer, debouncedZoekterm)
  }, [debouncedZoekterm, geselecteerdeWinkel, haalVoorraadOp])

  async function uitloggen() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  /* =========================
     SORT + FILTER
  ========================= */

  function toggleSort(k: string) {
    if (sortKey === k) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  const gefilterdEnGesorteerd = useMemo(() => {
    let arr = [...producten]

    if (zoekKolom !== 'ALL' && debouncedZoekterm) {
      const needle = debouncedZoekterm.toLowerCase()
      arr = arr.filter(p =>
        String(p[zoekKolom] ?? '').toLowerCase().includes(needle)
      )
    }

    if (sortKey) {
      arr.sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        if (av < bv) return sortDir === 'asc' ? -1 : 1
        if (av > bv) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    }

    return arr
  }, [producten, sortKey, sortDir, zoekKolom, debouncedZoekterm])

  const stickyKey = kolommen.find(isSticky)

  /* =========================
     UI
  ========================= */

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6 space-y-6">

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Voorraad Dashboard</h1>
        <button onClick={uitloggen} className="text-sm text-gray-600 hover:text-red-600">
          Uitloggen
        </button>
      </div>

      <div className="flex gap-3">
        <select
          onChange={e =>
            setGeselecteerdeWinkel(
              winkels.find(w => w.id === Number(e.target.value)) ?? null
            )
          }
          className="rounded-xl px-4 py-3 border border-gray-300 bg-white"
        >
          <option value="">Selecteer winkel</option>
          {winkels.map(w => (
            <option key={w.id} value={w.id}>
              {w.naam}
            </option>
          ))}
        </select>

        <input
          placeholder="Zoeken..."
          value={zoekterm}
          onChange={e => setZoekterm(e.target.value)}
          className="flex-1 rounded-xl px-4 py-3 border border-gray-300 bg-white"
        />
      </div>

      {geselecteerdeWinkel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {zichtbareKolommen.map(k => (
                  <th
                    key={k}
                    onClick={() => toggleSort(k)}
                    className={`px-4 py-3 text-left font-semibold cursor-pointer ${
                      stickyKey === k ? 'sticky left-0 bg-gray-100 z-20' : ''
                    }`}
                  >
                    {columnLabel(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={zichtbareKolommen.length} className="p-6 text-center">
                    Laden...
                  </td>
                </tr>
              ) : (
                gefilterdEnGesorteerd.map((p, i) => (
                  <tr key={i} className={i % 2 ? 'bg-gray-50' : ''}>
                    {zichtbareKolommen.map(k => (
                      <td
                        key={k}
                        className={`px-4 py-3 ${
                          stickyKey === k ? 'sticky left-0 bg-white z-10' : ''
                        }`}
                      >
                        {formatValue(k, p[k])}
                      </td>
                    ))}
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