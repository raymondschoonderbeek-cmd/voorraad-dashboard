'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
}

type Product = { [key: string]: any }

type Pivot = {
  brands: string[]
  groups: string[]
  matrix: Record<string, Record<string, number>>
  rowTotals: Record<string, number>
  colTotals: Record<string, number>
  grandTotal: number
}

function norm(v: any, fallback: string) {
  const s = String(v ?? '').trim()
  return s ? s : fallback
}

export default function BrandGroepPivotPage() {
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [geselecteerdeWinkel, setGeselecteerdeWinkel] = useState<Winkel | null>(null)

  const [producten, setProducten] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  const [filter, setFilter] = useState('') // filter op merk/groep
  const [minCount, setMinCount] = useState<number>(1) // verberg hele kleine combinaties
  const [sortRows, setSortRows] = useState<'name' | 'total'>('total')
  const [sortCols, setSortCols] = useState<'name' | 'total'>('total')

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
    if (winkel) await haalVoorraadOp(winkel.dealer_nummer)
  }

  const pivot: Pivot = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {}
    const rowTotals: Record<string, number> = {}
    const colTotals: Record<string, number> = {}

    let grandTotal = 0

    const needle = filter.trim().toLowerCase()

    for (const p of producten) {
      const brand = norm(p.BRAND_NAME, '(Geen merk)')
      const group = norm(p.GROUP_DESCRIPTION_1, '(Geen groep 1)')

      // filter op merk/groep
      if (needle) {
        const hay = `${brand} ${group}`.toLowerCase()
        if (!hay.includes(needle)) continue
      }

      matrix[brand] ??= {}
      matrix[brand][group] = (matrix[brand][group] ?? 0) + 1

      rowTotals[brand] = (rowTotals[brand] ?? 0) + 1
      colTotals[group] = (colTotals[group] ?? 0) + 1
      grandTotal += 1
    }

    // determine brand & group lists
    let brands = Object.keys(rowTotals)
    let groups = Object.keys(colTotals)

    // sort columns
    groups.sort((a, b) => {
      if (sortCols === 'name') return a.localeCompare(b)
      return (colTotals[b] ?? 0) - (colTotals[a] ?? 0) || a.localeCompare(b)
    })

    // sort rows
    brands.sort((a, b) => {
      if (sortRows === 'name') return a.localeCompare(b)
      return (rowTotals[b] ?? 0) - (rowTotals[a] ?? 0) || a.localeCompare(b)
    })

    // optionally drop cols that are always below minCount
    if (minCount > 1) {
      groups = groups.filter(g => (colTotals[g] ?? 0) >= minCount)
      brands = brands.filter(b => (rowTotals[b] ?? 0) >= minCount)
    }

    return { brands, groups, matrix, rowTotals, colTotals, grandTotal }
  }, [producten, filter, minCount, sortRows, sortCols])

  const winkelLabel = geselecteerdeWinkel
    ? `${geselecteerdeWinkel.naam} (#${geselecteerdeWinkel.dealer_nummer})`
    : ''

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6 space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">Pivot: Merk × Groep 1</h1>
          <p className="text-sm text-gray-500">
            Rijen = merken, kolommen = groep 1, cellen = aantallen. {winkelLabel ? `(${winkelLabel})` : ''}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr_140px_180px_180px] gap-3 items-center">
          <select
            value={geselecteerdeWinkel?.id ?? ''}
            onChange={e => selecteerWinkel(Number(e.target.value))}
            className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecteer winkel…</option>
            {winkels.map(w => (
              <option key={w.id} value={w.id}>
                {w.naam} (#{w.dealer_nummer})
              </option>
            ))}
          </select>

          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter (merk of groep 1)…"
            className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">Min totaal</span>
            <input
              type="number"
              min={1}
              value={minCount}
              onChange={e => setMinCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Verberg rijen/kolommen met lagere totalen"
            />
          </div>

          <select
            value={sortRows}
            onChange={e => setSortRows(e.target.value as any)}
            className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Sorteer rijen"
          >
            <option value="total">Sorteer merken: op totaal</option>
            <option value="name">Sorteer merken: op naam</option>
          </select>

          <select
            value={sortCols}
            onChange={e => setSortCols(e.target.value as any)}
            className="w-full rounded-xl px-3 py-3 text-sm bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Sorteer kolommen"
          >
            <option value="total">Sorteer groepen: op totaal</option>
            <option value="name">Sorteer groepen: op naam</option>
          </select>
        </div>

        <div className="text-xs text-gray-500 flex items-center justify-between">
          <span>
            {loading
              ? 'Laden…'
              : geselecteerdeWinkel
                ? `${pivot.grandTotal} items • ${pivot.brands.length} merken • ${pivot.groups.length} groepen`
                : 'Selecteer een winkel om te starten'}
          </span>
          {filter && (
            <button
              type="button"
              onClick={() => setFilter('')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Filter wissen
            </button>
          )}
        </div>
      </div>

      {!geselecteerdeWinkel ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 text-gray-500">
          Selecteer een winkel om de pivot te zien.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-auto relative">
            <table className="w-full text-sm [border-collapse:separate] [border-spacing:0]">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr className="text-xs uppercase tracking-wide text-gray-700">
                  {/* Sticky first column header */}
                  <th
                    className="px-4 py-3 text-left font-semibold sticky left-0 bg-gray-50 z-[60] shadow-[2px_0_0_0_rgba(229,231,235,1)]"
                    style={{ minWidth: 220 }}
                  >
                    Merk
                  </th>

                  {pivot.groups.map(g => (
                    <th key={g} className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                      {g}
                      <div className="text-[10px] text-gray-400 normal-case">
                        {pivot.colTotals[g] ?? 0}
                      </div>
                    </th>
                  ))}

                  {/* Total column */}
                  <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                    Totaal
                    <div className="text-[10px] text-gray-400 normal-case">{pivot.grandTotal}</div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3 sticky left-0 bg-white z-[40] shadow-[2px_0_0_0_rgba(229,231,235,1)]">
                        <div className="h-3 w-40 bg-gray-200 rounded" />
                      </td>
                      {Array.from({ length: Math.min(6, pivot.groups.length) }).map((__, j) => (
                        <td key={j} className="px-4 py-3 text-right">
                          <div className="h-3 w-10 bg-gray-200 rounded ml-auto" />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <div className="h-3 w-10 bg-gray-200 rounded ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : pivot.brands.length === 0 || pivot.groups.length === 0 ? (
                  <tr>
                    <td colSpan={pivot.groups.length + 2} className="px-6 py-10 text-center text-gray-500">
                      Geen resultaten (filter te streng?).
                    </td>
                  </tr>
                ) : (
                  pivot.brands.map((b, i) => {
                    const rowTotal = pivot.rowTotals[b] ?? 0
                    const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'

                    return (
                      <tr key={b} className={rowBg}>
                        {/* Sticky row header */}
                        <td
                          className={[
                            'px-4 py-3 font-semibold whitespace-nowrap',
                            'sticky left-0 z-[40] shadow-[2px_0_0_0_rgba(229,231,235,1)]',
                            rowBg,
                          ].join(' ')}
                        >
                          {b}
                          <div className="text-[11px] text-gray-500 font-normal">{rowTotal}</div>
                        </td>

                        {pivot.groups.map(g => {
                          const v = pivot.matrix[b]?.[g] ?? 0
                          const isZero = v === 0
                          return (
                            <td
                              key={g}
                              className={[
                                'px-4 py-3 text-right whitespace-nowrap',
                                isZero ? 'text-gray-300' : 'text-gray-900',
                              ].join(' ')}
                              title={`${b} × ${g}`}
                            >
                              {v === 0 ? '–' : v}
                            </td>
                          )
                        })}

                        {/* Row total */}
                        <td className="px-4 py-3 text-right font-bold whitespace-nowrap">{rowTotal}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>

              {/* Column totals footer */}
              {!loading && pivot.groups.length > 0 && pivot.brands.length > 0 && (
                <tfoot className="sticky bottom-0 bg-white border-t border-gray-200">
                  <tr className="text-xs uppercase tracking-wide text-gray-700">
                    <td className="px-4 py-3 font-semibold sticky left-0 bg-white z-[60] shadow-[2px_0_0_0_rgba(229,231,235,1)]">
                      Totaal
                    </td>
                    {pivot.groups.map(g => (
                      <td key={g} className="px-4 py-3 text-right font-semibold">
                        {pivot.colTotals[g] ?? 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-bold">{pivot.grandTotal}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {!loading && pivot.groups.length > 0 && pivot.brands.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 text-xs text-gray-500">
              Tip: gebruik filter om snel een merk of groep te vinden. “Min totaal” verbergt kleine rijen/kolommen.
            </div>
          )}
        </div>
      )}
    </div>
  )
}