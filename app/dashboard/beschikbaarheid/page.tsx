'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { BeschikbaarheidBadge } from '@/components/BeschikbaarheidBadge'
import { statusKleur, type GebruikerStatus, type BeschikbaarheidStatus } from '@/lib/beschikbaarheid'

const F = FONT_FAMILY
const fetcher = (url: string) => fetch(url).then(r => r.json())

type Groepering = 'afdeling' | 'status'

/** Initialen uit naam of e-mail */
function initialen(naam: string | null, email: string): string {
  if (naam) {
    const delen = naam.trim().split(/\s+/)
    if (delen.length >= 2) return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase()
    return naam.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

const AVATAR_COLORS = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#e0f2fe', fg: '#0369a1' },
  { bg: '#f0fdf4', fg: '#166534' },
]

function avatarKleur(naam: string | null, email: string) {
  const s = (naam ?? email)
  const seed = s.charCodeAt(0) + s.charCodeAt(Math.min(1, s.length - 1))
  return AVATAR_COLORS[seed % AVATAR_COLORS.length]
}

const STATUS_VOLGORDE: BeschikbaarheidStatus[] = ['beschikbaar', 'out-of-office', 'buiten-werktijd', 'onbekend']

const STATUS_LABELS: Record<BeschikbaarheidStatus, string> = {
  beschikbaar:       'Beschikbaar',
  'out-of-office':   'Out of office',
  'buiten-werktijd': 'Buiten werktijd',
  onbekend:          'Onbekend',
}

function statusSortOrder(s: BeschikbaarheidStatus) {
  return STATUS_VOLGORDE.indexOf(s)
}

function normaliseerAfdeling(afdeling: string | null | undefined): string | null {
  const raw = (afdeling ?? '').trim()
  if (!raw) return null
  const hoofdAfdeling = raw.split(',')[0]?.trim() ?? ''
  return hoofdAfdeling || null
}

/** Compact kaart per persoon */
function PersonCard({ g, now }: { g: GebruikerStatus; now: Date }) {
  const av = avatarKleur(g.naam, g.email)
  const init = initialen(g.naam, g.email)
  const { dot: borderColor, bg: statusBg, fg: statusFg } = statusKleur(g.status)

  const werkInfo = useMemo(() => {
    if (g.status !== 'beschikbaar' || !g.work_schedule) return null
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = days[now.getDay()] as keyof typeof g.work_schedule
    const dag = g.work_schedule[dayName]
    if (!dag?.enabled) return null
    return `${dag.start}–${dag.end}`
  }, [g.status, g.work_schedule, now])

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: '1px solid rgba(0,0,0,0.07)',
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: '0 1px 6px rgba(45,69,124,0.05)',
      }}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
          style={{ background: av.bg, color: av.fg, fontFamily: F }}
          aria-hidden
        >
          {init}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: '#1e293b', fontFamily: F }}>
            {g.naam ?? g.email.split('@')[0]}
          </div>
          <div className="text-[11px] truncate mt-0.5" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
            {g.email}
          </div>
          <div className="mt-2">
            <BeschikbaarheidBadge
              status={g.status}
              oofStart={g.oof_start}
              oofEnd={g.oof_end}
              nextAvailableLabel={g.next_available_label}
            />
          </div>
        </div>
      </div>

      {(werkInfo || (g.next_available_label && g.status !== 'beschikbaar')) && (
        <div
          className="px-4 py-2 flex items-center gap-1.5 text-[11px] font-medium border-t"
          style={{ borderColor: 'rgba(0,0,0,0.06)', background: statusBg, color: statusFg, fontFamily: F }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          {g.status === 'beschikbaar' ? `Werkt ${werkInfo}` : g.next_available_label}
        </div>
      )}
    </div>
  )
}

/** Compacte tabelrij */
function PersonRow({ g }: { g: GebruikerStatus }) {
  const av = avatarKleur(g.naam, g.email)
  const init = initialen(g.naam, g.email)
  const { dot: borderColor } = statusKleur(g.status)

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50/80 transition-colors border-b last:border-b-0"
      style={{ borderColor: 'rgba(0,0,0,0.06)', borderLeft: `3px solid ${borderColor}` }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: av.bg, color: av.fg, fontFamily: F }}
        aria-hidden
      >
        {init}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: '#1e293b', fontFamily: F }}>
          {g.naam ?? g.email.split('@')[0]}
        </div>
        {g.next_available_label && g.status !== 'beschikbaar' && (
          <div className="text-[11px] truncate mt-0.5" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
            {g.next_available_label}
          </div>
        )}
      </div>
      <div className="shrink-0">
        <BeschikbaarheidBadge
          status={g.status}
          oofStart={g.oof_start}
          oofEnd={g.oof_end}
          nextAvailableLabel={g.next_available_label}
          compact
        />
      </div>
    </div>
  )
}

/** Statusbalk: mini-overzicht van statussen binnen een groep */
function StatusBar({ items }: { items: GebruikerStatus[] }) {
  const totaal = items.length
  if (totaal === 0) return null
  const tellen = {
    beschikbaar:       items.filter(g => g.status === 'beschikbaar').length,
    'out-of-office':   items.filter(g => g.status === 'out-of-office').length,
    'buiten-werktijd': items.filter(g => g.status === 'buiten-werktijd').length,
  }
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {(Object.entries(tellen) as [BeschikbaarheidStatus, number][])
        .filter(([, n]) => n > 0)
        .map(([status, n]) => {
          const { dot, fg, bg } = statusKleur(status)
          return (
            <span
              key={status}
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
              style={{ background: bg, color: fg, fontFamily: F }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} aria-hidden />
              {n} {STATUS_LABELS[status].toLowerCase()}
            </span>
          )
        })}
    </div>
  )
}

export default function BeschikbaarheidDashboardPage() {
  const [zoek, setZoek] = useState('')
  const [weergave, setWeergave] = useState<'kaarten' | 'lijst'>('kaarten')
  const [groepering, setGroepering] = useState<Groepering>('afdeling')
  const [syncBezig, setSyncBezig] = useState(false)
  const [syncResultaat, setSyncResultaat] = useState<string | null>(null)

  // Datum: '' = vandaag (live), anders YYYY-MM-DD
  const vandaagStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const [gekozenDatum, setGekozenDatum] = useState('')
  const isVandaag = !gekozenDatum || gekozenDatum === vandaagStr

  // `now` voor client-side berekeningen (PersonCard werktijden)
  const now = useMemo(() => {
    if (isVandaag) return new Date()
    const d = new Date(`${gekozenDatum}T10:00:00Z`)
    return Number.isNaN(d.getTime()) ? new Date() : d
  }, [gekozenDatum, isVandaag])

  const statusUrl = isVandaag
    ? '/api/beschikbaarheid/status'
    : `/api/beschikbaarheid/status?date=${gekozenDatum}`

  const { data: sessionData } = useSWR<{ isAdmin?: boolean }>(
    '/api/auth/session-info', fetcher, { revalidateOnFocus: false }
  )
  const isAdmin = sessionData?.isAdmin === true

  const { data, isLoading, mutate } = useSWR<{ statussen: GebruikerStatus[]; timestamp: string }>(
    statusUrl,
    fetcher,
    { refreshInterval: isVandaag ? 60_000 : 0 }
  )

  const statussen = data?.statussen ?? []

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return statussen
    return statussen.filter(g =>
      (g.naam ?? '').toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q) ||
      (normaliseerAfdeling(g.afdeling) ?? '').toLowerCase().includes(q)
    )
  }, [statussen, zoek])

  const heeftAfdelingsdata = useMemo(
    () => statussen.some(g => normaliseerAfdeling(g.afdeling) !== null),
    [statussen]
  )

  const effectieveGroepering: Groepering =
    groepering === 'afdeling' && !heeftAfdelingsdata ? 'status' : groepering

  // Groepeer per afdeling of per status
  const groepen = useMemo(() => {
    if (effectieveGroepering === 'status') {
      return STATUS_VOLGORDE
        .map(s => ({
          sleutel: s,
          label: STATUS_LABELS[s],
          items: [...gefilterd]
            .filter(g => g.status === s)
            .sort((a, b) => (a.naam ?? a.email).localeCompare(b.naam ?? b.email, 'nl')),
        }))
        .filter(gr => gr.items.length > 0)
    }

    // Afdeling-groepering
    const map = new Map<string, GebruikerStatus[]>()
    for (const g of gefilterd) {
      const key = normaliseerAfdeling(g.afdeling) ?? 'Onbekend'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(g)
    }

    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === 'Onbekend') return 1
        if (b === 'Onbekend') return -1
        return a.localeCompare(b, 'nl')
      })
      .map(([sleutel, items]) => ({
        sleutel,
        label: sleutel,
        items: [...items].sort((a, b) => {
          const statusDiff = statusSortOrder(a.status) - statusSortOrder(b.status)
          if (statusDiff !== 0) return statusDiff
          return (a.naam ?? a.email).localeCompare(b.naam ?? b.email, 'nl')
        }),
      }))
  }, [gefilterd, effectieveGroepering])

  const tellen = useMemo(() => ({
    beschikbaar: statussen.filter(g => g.status === 'beschikbaar').length,
    oof: statussen.filter(g => g.status === 'out-of-office').length,
    buiten: statussen.filter(g => g.status === 'buiten-werktijd').length,
  }), [statussen])

  const afdelingsTelling = useMemo(() => {
    const metAfdeling = statussen.filter(g => normaliseerAfdeling(g.afdeling) !== null).length
    const zonderAfdeling = statussen.length - metAfdeling
    return {
      totaal: statussen.length,
      metAfdeling,
      zonderAfdeling,
    }
  }, [statussen])

  const timestamp = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null

  const handleBulkSync = async () => {
    setSyncBezig(true)
    setSyncResultaat(null)
    try {
      const res = await fetch('/api/beschikbaarheid/bulk-sync', { method: 'POST' })
      const d = await res.json() as {
        ok?: boolean; totaal?: number; graph_gesynchroniseerd?: number
        standaard_aangemaakt?: number; fouten?: string[]; graph_configured?: boolean
      }
      if (!res.ok) {
        setSyncResultaat(`Fout: ${JSON.stringify(d)}`)
      } else {
        const graphDeel = d.graph_configured
          ? `${d.graph_gesynchroniseerd ?? 0} via Graph gesynchroniseerd`
          : `Graph niet geconfigureerd`
        const foutDeel = (d.fouten?.length ?? 0) > 0 ? ` · ${d.fouten!.length} fouten` : ''
        setSyncResultaat(`${d.totaal} gebruikers verwerkt · ${graphDeel} · ${d.standaard_aangemaakt ?? 0} standaard aangemaakt${foutDeel}`)
        void mutate()
      }
    } catch (e) {
      setSyncResultaat(`Netwerkfout: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncBezig(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10" style={{ borderColor: dashboardUi.sectionDivider }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard"
            className="text-sm font-medium flex items-center gap-1.5 hover:opacity-75 transition-opacity shrink-0"
            style={{ color: DYNAMO_BLUE }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Dashboard
          </Link>
          <span className="text-gray-300 select-none">/</span>
          <span className="text-sm font-semibold" style={{ color: '#1e293b' }}>Beschikbaarheid</span>
          <div className="ml-auto flex items-center gap-2">
            {timestamp && (
              <span className="text-xs hidden sm:block" style={{ color: dashboardUi.textMuted }}>
                Bijgewerkt {timestamp}
              </span>
            )}
            <button
              type="button"
              onClick={() => void mutate()}
              className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
              title="Vernieuwen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: DYNAMO_BLUE }} aria-hidden>
                <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">

        {/* Kop */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold m-0" style={{ color: DYNAMO_BLUE }}>Beschikbaarheid team</h1>
            <p className="text-sm m-0 mt-0.5" style={{ color: dashboardUi.textMuted }}>
              Wie is er vandaag beschikbaar?
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {isAdmin && (
              <button
                type="button"
                onClick={() => void handleBulkSync()}
                disabled={syncBezig}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white' }}
                title="Haal mailboxinstellingen op voor alle portalgebruikers"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  className={syncBezig ? 'animate-spin' : ''} aria-hidden>
                  <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                {syncBezig ? 'Syncen…' : 'Sync alle'}
              </button>
            )}
            <Link
              href="/dashboard/instellingen/beschikbaarheid"
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              Mijn instellingen
            </Link>
          </div>
        </div>

        {/* Sync-resultaat melding */}
        {syncResultaat && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 flex items-start justify-between gap-2">
            <span>{syncResultaat}</span>
            <button type="button" onClick={() => setSyncResultaat(null)} className="shrink-0 text-blue-500 hover:text-blue-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}

        {/* Stat-chips */}
        {!isLoading && statussen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <StatChip color="#16a34a" bg="#dcfce7" label={`${tellen.beschikbaar} beschikbaar`}
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>}
            />
            {tellen.oof > 0 && (
              <StatChip color="#c2410c" bg="#fff7ed" label={`${tellen.oof} out of office`}
                icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
            )}
            {tellen.buiten > 0 && (
              <StatChip color="#64748b" bg="#f1f5f9" label={`${tellen.buiten} buiten werktijd`}
                icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              />
            )}
            <StatChip
              color={afdelingsTelling.zonderAfdeling > 0 ? '#92400e' : '#166534'}
              bg={afdelingsTelling.zonderAfdeling > 0 ? '#fffbeb' : '#f0fdf4'}
              label={`Afdeling: ${afdelingsTelling.metAfdeling}/${afdelingsTelling.totaal}`}
              icon={
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                </svg>
              }
            />
          </div>
        )}

        {/* Datumkiezer */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-xl border overflow-hidden"
            style={{ borderColor: 'rgba(45,69,124,0.2)', background: 'white' }}>
            {/* Vorige dag */}
            <button
              type="button"
              onClick={() => {
                const base = gekozenDatum || vandaagStr
                const d = new Date(`${base}T12:00:00Z`)
                d.setUTCDate(d.getUTCDate() - 1)
                const s = d.toISOString().slice(0, 10)
                setGekozenDatum(s === vandaagStr ? '' : s)
              }}
              className="px-2.5 py-2 hover:bg-slate-50 transition-colors"
              style={{ color: DYNAMO_BLUE }}
              title="Vorige dag"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            {/* Datuminput */}
            <div className="relative flex items-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-2 pointer-events-none" style={{ color: DYNAMO_BLUE }} aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <input
                type="date"
                value={gekozenDatum || vandaagStr}
                onChange={e => {
                  const v = e.target.value
                  setGekozenDatum(v === vandaagStr ? '' : v)
                }}
                className="pl-7 pr-2 py-2 text-sm font-medium outline-none bg-transparent"
                style={{ color: '#1e293b', fontFamily: F, width: '140px' }}
              />
            </div>

            {/* Volgende dag */}
            <button
              type="button"
              onClick={() => {
                const base = gekozenDatum || vandaagStr
                const d = new Date(`${base}T12:00:00Z`)
                d.setUTCDate(d.getUTCDate() + 1)
                const s = d.toISOString().slice(0, 10)
                setGekozenDatum(s === vandaagStr ? '' : s)
              }}
              className="px-2.5 py-2 hover:bg-slate-50 transition-colors"
              style={{ color: DYNAMO_BLUE }}
              title="Volgende dag"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Vandaag-knop: alleen tonen als een andere datum is geselecteerd */}
          {!isVandaag && (
            <button
              type="button"
              onClick={() => setGekozenDatum('')}
              className="rounded-xl px-3 py-2 text-xs font-semibold border transition hover:opacity-80"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
            >
              Vandaag
            </button>
          )}

          {/* Label: niet-vandaag datumindicator */}
          {!isVandaag && (
            <span className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE, fontFamily: F }}>
              {new Date(`${gekozenDatum}T12:00:00Z`).toLocaleDateString('nl-NL', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </span>
          )}
        </div>

        {/* Melding: afdeling gekozen maar geen data */}
        {groepering === 'afdeling' && !heeftAfdelingsdata && !isLoading && statussen.length > 0 && (
          <div className="rounded-xl border px-4 py-3 flex items-start gap-3"
            style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92400e"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold m-0" style={{ color: '#92400e', fontFamily: F }}>
                Afdelingsdata ontbreekt
              </p>
              <p className="text-xs mt-0.5 m-0" style={{ color: '#b45309', fontFamily: F }}>
                Voer eerst een{' '}
                <strong>Azure-sync</strong> uit (Beheer → Azure-sync) zodat afdelingen worden ingelezen.
                {isAdmin && <> Daarna klik op <strong>Sync alle</strong> om beschikbaarheid te vullen.</>}
                {' '}Nu gegroepeerd op status. Zonder afdeling: <strong>{afdelingsTelling.zonderAfdeling}</strong> van <strong>{afdelingsTelling.totaal}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Toolbar: zoek + groepering + weergave */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoek */}
          <div className="flex-1 min-w-48 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: dashboardUi.textMuted }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="search"
              placeholder="Naam, afdeling of e-mail…"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm outline-none transition focus:border-[#2D457C] focus:ring-2 focus:ring-[#2D457C]/20"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: '#1e293b', fontFamily: F }}
            />
          </div>

          {/* Groepering */}
          <div className="flex rounded-xl border overflow-hidden shrink-0" style={{ borderColor: 'rgba(45,69,124,0.2)' }}>
            {(['afdeling', 'status'] as const).map(g => {
              const actief = effectieveGroepering === g
              const gekozen = groepering === g
              const uitgeschakeld = g === 'afdeling' && !heeftAfdelingsdata
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroepering(g)}
                  className="px-3 py-2 text-xs font-semibold transition-colors first:border-r"
                  style={{
                    background: actief ? DYNAMO_BLUE : 'white',
                    color: actief ? 'white' : uitgeschakeld ? 'rgba(45,69,124,0.35)' : DYNAMO_BLUE,
                    borderColor: 'rgba(45,69,124,0.2)',
                  }}
                  aria-pressed={gekozen}
                  title={uitgeschakeld ? 'Geen afdelingsdata — voer eerst een Azure-sync uit' : undefined}
                >
                  {g === 'afdeling' ? 'Afdeling' : 'Status'}
                  {uitgeschakeld && (
                    <span className="ml-1 opacity-50">⚠</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Kaart/lijst */}
          <div className="flex rounded-xl border overflow-hidden shrink-0" style={{ borderColor: 'rgba(45,69,124,0.2)' }}>
            <button type="button" onClick={() => setWeergave('kaarten')}
              className="px-3 py-2 transition-colors" title="Kaartweergave"
              style={{ background: weergave === 'kaarten' ? DYNAMO_BLUE : 'white', color: weergave === 'kaarten' ? 'white' : DYNAMO_BLUE }}
              aria-pressed={weergave === 'kaarten'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button type="button" onClick={() => setWeergave('lijst')}
              className="px-3 py-2 transition-colors border-l" title="Lijstweergave"
              style={{ background: weergave === 'lijst' ? DYNAMO_BLUE : 'white', color: weergave === 'lijst' ? 'white' : DYNAMO_BLUE, borderColor: 'rgba(45,69,124,0.2)' }}
              aria-pressed={weergave === 'lijst'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <span className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
          </div>
        ) : statussen.length === 0 ? (
          <EmptyState isAdmin={isAdmin} onSync={() => void handleBulkSync()} />
        ) : gefilterd.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            <p className="text-sm" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
              Geen resultaten voor &ldquo;{zoek}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groepen.map(({ sleutel, label, items }) => (
              <section key={sleutel}>
                {/* Groepkop */}
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <h2 className="text-xs font-bold uppercase tracking-wide m-0" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
                    {label}
                  </h2>
                  <span
                    className="text-xs font-semibold rounded-full px-2 py-0.5 leading-none"
                    style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE, fontFamily: F }}
                  >
                    {items.length}
                  </span>
                  {/* Statusbalk per afdeling (alleen bij afdeling-groepering) */}
                  {effectieveGroepering === 'afdeling' && <StatusBar items={items} />}
                </div>

                {weergave === 'kaarten' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map(g => <PersonCard key={g.user_id} g={g} now={now} />)}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
                    {items.map(g => <PersonRow key={g.user_id} g={g} />)}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {!isLoading && statussen.length > 0 && (
          <p className="text-center text-[11px] pb-2" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
            Automatisch vernieuwd elke minuut{timestamp && ` · Laatste update ${timestamp}`}
          </p>
        )}
      </main>
    </div>
  )
}

function EmptyState({ isAdmin, onSync }: { isAdmin: boolean; onSync: () => void }) {
  return (
    <div className="bg-white rounded-2xl border p-10 text-center space-y-3" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
      <div className="text-4xl">👥</div>
      <p className="text-sm font-semibold m-0" style={{ color: '#1e293b', fontFamily: FONT_FAMILY }}>
        Nog geen beschikbaarheidsdata
      </p>
      <p className="text-xs m-0" style={{ color: dashboardUi.textMuted, fontFamily: FONT_FAMILY }}>
        {isAdmin
          ? 'Gebruik "Sync alle" om voor iedereen beschikbaarheidsdata op te halen, of laat collega\'s zelf hun instellingen opslaan.'
          : 'Collega\'s kunnen hun beschikbaarheid instellen via Instellingen → Beschikbaarheid.'}
      </p>
      {isAdmin && (
        <button
          type="button"
          onClick={onSync}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ background: DYNAMO_BLUE, fontFamily: FONT_FAMILY }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Sync alle gebruikers
        </button>
      )}
      <p className="text-xs m-0">
        <Link href="/dashboard/instellingen/beschikbaarheid" className="underline" style={{ color: DYNAMO_BLUE, fontFamily: FONT_FAMILY }}>
          Mijn beschikbaarheid instellen →
        </Link>
      </p>
    </div>
  )
}

function StatChip({ color, bg, label, icon }: { color: string; bg: string; label: string; icon: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
      style={{ background: bg, color, fontFamily: FONT_FAMILY }}>
      {icon}{label}
    </span>
  )
}
