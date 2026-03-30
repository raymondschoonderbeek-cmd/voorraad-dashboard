'use client'

import { useMemo } from 'react'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import type { ItCmdbHardwareListItem, IntuneSnapshot } from '@/lib/it-cmdb-types'

const F = FONT_FAMILY
const TABLE_TEXT = '#1e293b'

function isSnapshot(v: unknown): v is IntuneSnapshot {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  return typeof o.graphDeviceId === 'string'
}

type Props = {
  items: ItCmdbHardwareListItem[]
  /** Huidige filterresultaten — titel toont dit */
  filteredCount: number
}

/**
 * Dashboard op basis van intune_snapshot (na Graph-sync). Geen snapshot = niet meegeteld in detailkaarten.
 */
export function IntuneOverview({ items, filteredCount }: Props) {
  const agg = useMemo(() => {
    const withSnap: { row: ItCmdbHardwareListItem; s: IntuneSnapshot }[] = []
    for (const row of items) {
      if (isSnapshot(row.intune_snapshot)) {
        withSnap.push({ row, s: row.intune_snapshot })
      }
    }

    const compliance = new Map<string, number>()
    const management = new Map<string, number>()
    const manufacturer = new Map<string, number>()
    let lastSyncMax: Date | null = null

    for (const { s } of withSnap) {
      const c = s.complianceState?.trim() || '(Onbekend)'
      const m = s.managementState?.trim() || '(Onbekend)'
      compliance.set(c, (compliance.get(c) ?? 0) + 1)
      management.set(m, (management.get(m) ?? 0) + 1)
      const man = s.manufacturer?.trim() || '(Onbekend)'
      manufacturer.set(man, (manufacturer.get(man) ?? 0) + 1)
      if (s.lastSyncDateTime) {
        const d = new Date(s.lastSyncDateTime)
        if (!Number.isNaN(d.getTime())) {
          if (!lastSyncMax || d > lastSyncMax) lastSyncMax = d
        }
      }
    }

    const complianceRows = [...compliance.entries()].sort((a, b) => b[1] - a[1])
    const managementRows = [...management.entries()].sort((a, b) => b[1] - a[1])
    const manufacturerRows = [...manufacturer.entries()].sort((a, b) => b[1] - a[1])

    const compliantGuess = withSnap.filter(({ s }) => {
      const x = (s.complianceState ?? '').toLowerCase()
      return x === 'compliant'
    }).length
    const nonCompliantGuess = withSnap.filter(({ s }) => {
      const x = (s.complianceState ?? '').toLowerCase()
      return x.includes('noncompliant') || x.includes('non-compliant')
    }).length

    const topRecent = [...withSnap]
      .sort((a, b) => {
        const ta = a.s.lastSyncDateTime ? new Date(a.s.lastSyncDateTime).getTime() : 0
        const tb = b.s.lastSyncDateTime ? new Date(b.s.lastSyncDateTime).getTime() : 0
        return tb - ta
      })
      .slice(0, 8)

    return {
      withSnap,
      nSnap: withSnap.length,
      complianceRows,
      managementRows,
      manufacturerRows,
      compliantGuess,
      nonCompliantGuess,
      lastSyncMax,
      topRecent,
    }
  }, [items])

  const maxC = agg.complianceRows[0]?.[1] ?? 1
  const maxM = agg.managementRows[0]?.[1] ?? 1
  const maxMan = agg.manufacturerRows[0]?.[1] ?? 1

  if (!items.length) return null

  return (
    <section
      className="rounded-2xl p-4 sm:p-6 space-y-5"
      style={{ background: dashboardUi.cardWhite.background, border: dashboardUi.cardWhite.border, boxShadow: dashboardUi.cardWhite.boxShadow }}
      aria-labelledby="it-cmdb-intune-overview-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 id="it-cmdb-intune-overview-heading" className="text-lg font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
            Intune-overzicht
          </h2>
          <p className="text-xs m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
            Op basis van velden uit Microsoft Graph (managedDevices). Detailstatistieken verschijnen na <strong style={{ color: TABLE_TEXT }}>Sync Intune</strong>
            {agg.nSnap === 0 ? ' — nog geen snapshot in deze selectie.' : ` — ${agg.nSnap} van ${filteredCount} regel(s) met Intune-data.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          className="rounded-xl p-4 border"
          style={{ borderColor: 'rgba(45,69,124,0.12)', background: 'rgba(45,69,124,0.04)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
            Met Intune-data
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
            {agg.nSnap}
          </div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{ borderColor: 'rgba(22,163,74,0.25)', background: 'rgba(22,163,74,0.06)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
            Compliant (Graph)
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#15803d', fontFamily: F }}>
            {agg.compliantGuess}
          </div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{ borderColor: 'rgba(220,38,38,0.2)', background: 'rgba(254,242,242,0.6)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
            Non-compliant
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: '#b91c1c', fontFamily: F }}>
            {agg.nonCompliantGuess}
          </div>
        </div>
        <div
          className="rounded-xl p-4 border"
          style={{ borderColor: 'rgba(45,69,124,0.12)', background: 'rgba(45,69,124,0.04)' }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
            Nieuwste sync (Graph)
          </div>
          <div className="text-sm font-semibold mt-1.5 leading-snug" style={{ color: TABLE_TEXT, fontFamily: F }}>
            {agg.lastSyncMax
              ? agg.lastSyncMax.toLocaleString('nl-NL', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </div>
        </div>
      </div>

      {agg.nSnap > 0 && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-bold m-0 mb-3" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                Compliance (complianceState)
              </h3>
              <ul className="space-y-2.5 m-0 p-0 list-none">
                {agg.complianceRows.map(([label, count]) => {
                  const pct = maxC > 0 ? Math.round((count / maxC) * 100) : 0
                  const pctOfTotal = agg.nSnap > 0 ? Math.round((count / agg.nSnap) * 100) : 0
                  return (
                    <li key={label}>
                      <div className="flex justify-between gap-2 text-xs mb-1">
                        <span className="font-medium truncate min-w-0" style={{ color: TABLE_TEXT, fontFamily: F }} title={label}>
                          {label}
                        </span>
                        <span className="tabular-nums shrink-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          {count}{' '}
                          <span style={{ color: dashboardUi.textMuted, fontWeight: 400 }}>({pctOfTotal}%)</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(45,69,124,0.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DYNAMO_BLUE }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold m-0 mb-3" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                Beheerstatus (managementState)
              </h3>
              <ul className="space-y-2.5 m-0 p-0 list-none">
                {agg.managementRows.map(([label, count]) => {
                  const pct = maxM > 0 ? Math.round((count / maxM) * 100) : 0
                  const pctOfTotal = agg.nSnap > 0 ? Math.round((count / agg.nSnap) * 100) : 0
                  return (
                    <li key={label}>
                      <div className="flex justify-between gap-2 text-xs mb-1">
                        <span className="font-medium truncate min-w-0" style={{ color: TABLE_TEXT, fontFamily: F }} title={label}>
                          {label}
                        </span>
                        <span className="tabular-nums shrink-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          {count}{' '}
                          <span style={{ color: dashboardUi.textMuted, fontWeight: 400 }}>({pctOfTotal}%)</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(45,69,124,0.08)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DYNAMO_BLUE }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold m-0 mb-3" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
              Fabrikant (manufacturer)
            </h3>
            <div className="flex flex-wrap gap-2">
              {agg.manufacturerRows.slice(0, 12).map(([label, count]) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border"
                  style={{
                    borderColor: 'rgba(45,69,124,0.15)',
                    background: 'rgba(45,69,124,0.06)',
                    color: TABLE_TEXT,
                    fontFamily: F,
                  }}
                >
                  <span className="truncate max-w-[180px]" title={label}>
                    {label}
                  </span>
                  <span className="font-bold tabular-nums" style={{ color: DYNAMO_BLUE }}>
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold m-0 mb-2" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
              Recentste check-in (lastSyncDateTime)
            </h3>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'rgba(45,69,124,0.1)' }}>
              <table className="w-full text-xs border-collapse min-w-[640px]" style={{ fontFamily: F }}>
                <thead>
                  <tr style={{ background: 'rgba(45,69,124,0.06)' }}>
                    {['Serie', 'Hostname', 'Compliance', 'Beheer', 'Laatste sync', 'Model'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-bold whitespace-nowrap" style={{ color: DYNAMO_BLUE }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agg.topRecent.map(({ row, s }) => (
                    <tr key={row.id} className="border-t border-[rgba(45,69,124,0.08)]">
                      <td className="px-3 py-2 font-mono font-semibold" style={{ color: DYNAMO_BLUE }}>
                        {row.serial_number}
                      </td>
                      <td className="px-3 py-2 max-w-[140px] truncate" style={{ color: TABLE_TEXT }} title={row.hostname}>
                        {row.hostname || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                        {s.complianceState ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                        {s.managementState ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                        {s.lastSyncDateTime
                          ? new Date(s.lastSyncDateTime).toLocaleString('nl-NL', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: TABLE_TEXT }} title={[s.manufacturer, s.model].filter(Boolean).join(' ') || ''}>
                        {[s.manufacturer, s.model].filter(Boolean).join(' ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {agg.nSnap === 0 && filteredCount > 0 && (
        <p className="text-sm m-0 rounded-xl p-4" style={{ background: 'rgba(45,69,124,0.06)', color: dashboardUi.textMuted, fontFamily: F }}>
          Geen Intune-snapshot in deze resultaten. Voer <strong style={{ color: TABLE_TEXT }}>Sync Intune</strong> uit om compliance, beheerstatus en sync-tijden per apparaat op te slaan.
        </p>
      )}
    </section>
  )
}
