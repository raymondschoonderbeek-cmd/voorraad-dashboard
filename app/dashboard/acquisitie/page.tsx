'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE } from '@/lib/theme'
import { IconArrowLeft } from '@/components/DashboardIcons'

const fetcher = async (url: string) => {
  const r = await fetch(url)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
  return json
}

type ContactMoment = {
  id: string
  [key: string]: unknown
}

type FilterState = {
  search: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

interface ApiResponse {
  data: ContactMoment[]
  count: number
}

function decodeSPKolomnaam(name: string): string {
  return name
    .replace(/_x003a_/g, ':')
    .replace(/_x0020_/g, ' ')
    .replace(/_x0028_/g, '(')
    .replace(/_x0029_/g, ')')
    .replace(/LookupId$/, '')
    .replace(/_/g, ' ')
    .trim()
}

function formatCelWaarde(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (Array.isArray(val)) return val.map(formatCelWaarde).join(', ') || '—'
  if (typeof val === 'object') {
    const o = val as Record<string, unknown>
    const tekst = o.displayName ?? o.Title ?? o.LookupValue ?? o.name ?? o.email
    if (tekst != null) return String(tekst)
    return JSON.stringify(val).slice(0, 100)
  }
  return String(val).slice(0, 100)
}

function parseContactMoments(raw: unknown): ContactMoment[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: unknown) => {
    const obj = item as Record<string, unknown>
    return {
      id: (obj.id || obj.ID || Math.random().toString(36).substr(2, 9)) as string,
      ...obj,
    }
  })
}

export default function AcquisitievePage() {
  const [filters, setFilters] = useState<FilterState>({ search: '' })

  const { data, isLoading, error } = useSWR<ApiResponse>(
    '/api/acquisitie',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60 * 1000 }, // refresh elke 5 min
  )

  const items = useMemo(() => parseContactMoments(data?.data), [data])

  const filtered = useMemo(() => {
    let result = [...items]

    if (filters.search) {
      const needle = filters.search.toLowerCase()
      result = result.filter(item =>
        Object.values(item)
          .map(v => String(v ?? '').toLowerCase())
          .join(' ')
          .includes(needle),
      )
    }

    return result
  }, [items, filters])

  const stats = useMemo(() => {
    return {
      total: items.length,
      filtered: filtered.length,
    }
  }, [items, filtered])

  const handleSearch = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, search: value }))
  }, [])

  const handleReset = useCallback(() => {
    setFilters({ search: '' })
  }, [])

  const columns = useMemo(() => {
    if (items.length === 0) return []
    const sample = items[0]
    return Object.keys(sample).filter(k => k !== 'id')
  }, [items])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--drg-bg)' }}>
      {/* Topbar */}
      <div className="sticky top-0 z-40" style={{ backgroundColor: 'var(--drg-card)', borderBottom: '1px solid var(--drg-line)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-lg hover:opacity-70 transition-opacity"
              style={{ backgroundColor: 'var(--drg-bg)' }}
              aria-label="Terug naar dashboard"
            >
              <IconArrowLeft />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--drg-ink)' }}>
                Contactmomenten Acquisitie
              </h1>
              <p className="text-sm" style={{ color: 'var(--drg-text-2)' }}>
                Gegevens uit SharePoint: AcquisitieNederland
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error state */}
        {error && (
          <div
            className="mb-6 p-4 rounded-lg"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', borderLeft: '4px solid var(--drg-danger)' }}
          >
            <p style={{ color: 'var(--drg-danger)', fontWeight: 500 }}>
              Fout bij laden: {error instanceof Error ? error.message : 'Onbekende fout'}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block" style={{ color: DYNAMO_BLUE }}>
              <p className="mb-2">Data laden...</p>
              <div className="animate-spin w-8 h-8 rounded-full border-2 border-opacity-30 border-current border-t-current" />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div
            className="text-center py-12 rounded-lg"
            style={{ backgroundColor: 'var(--drg-card)', borderRadius: '10px', padding: '3rem' }}
          >
            <p className="text-lg font-medium" style={{ color: 'var(--drg-ink)' }}>
              Geen contactmomenten gevonden
            </p>
            <p style={{ color: 'var(--drg-text-2)' }}>
              SharePoint-koppeling is misschien niet geconfigureerd.
            </p>
          </div>
        )}

        {/* Content */}
        {!isLoading && items.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--drg-text-2)' }}>
                  Totaal items
                </p>
                <p className="text-3xl font-bold" style={{ color: DYNAMO_BLUE }}>
                  {stats.total}
                </p>
              </div>
              <div className="p-4 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--drg-text-2)' }}>
                  Na filters
                </p>
                <p className="text-3xl font-bold" style={{ color: DYNAMO_BLUE }}>
                  {stats.filtered}
                </p>
              </div>
              <div className="p-4 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--drg-text-2)' }}>
                  Kolommen
                </p>
                <p className="text-3xl font-bold" style={{ color: DYNAMO_BLUE }}>
                  {columns.length}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div
              className="mb-6 p-4 rounded-[10px]"
              style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--drg-ink)' }}>
                    Zoeken
                  </label>
                  <input
                    type="text"
                    placeholder="Zoek in alle velden..."
                    value={filters.search}
                    onChange={e => handleSearch(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border"
                    style={{
                      borderColor: 'var(--drg-line)',
                      backgroundColor: 'var(--drg-bg)',
                      color: 'var(--drg-ink)',
                    }}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 rounded-lg font-medium transition-opacity hover:opacity-70"
                    style={{
                      backgroundColor: 'var(--drg-bg)',
                      color: 'var(--drg-text-2)',
                      border: '1px solid var(--drg-line)',
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div
              className="rounded-[10px] overflow-hidden border"
              style={{ backgroundColor: 'var(--drg-card)', borderColor: 'var(--drg-line)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: 'var(--drg-bg)', borderBottom: '1px solid var(--drg-line)' }}>
                      {columns.map(col => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left font-semibold whitespace-nowrap"
                          style={{
                            color: 'var(--drg-ink)',
                            textTransform: 'uppercase',
                            fontSize: '11px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {decodeSPKolomnaam(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 100).map((item, idx) => (
                      <tr
                        key={item.id}
                        style={{
                          backgroundColor: idx % 2 === 0 ? 'var(--drg-card)' : 'var(--drg-bg)',
                          borderBottom: '1px solid var(--drg-line)',
                        }}
                      >
                        {columns.map(col => (
                          <td key={col} className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--drg-ink)' }}>
                            {formatCelWaarde(item[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filtered.length > 100 && (
                <div className="px-4 py-3 text-center text-sm" style={{ backgroundColor: 'var(--drg-bg)', color: 'var(--drg-text-2)' }}>
                  Eerste 100 van {filtered.length} items weergegeven. Verfijn uw zoekopdracht om meer items te zien.
                </div>
              )}
            </div>

            {/* Refresh info */}
            <div className="mt-4 text-center text-xs" style={{ color: 'var(--drg-text-3)' }}>
              Gegevens auto-refresh elke 5 minuten. Laatst bijgewerkt: {new Date().toLocaleTimeString('nl-NL')}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
