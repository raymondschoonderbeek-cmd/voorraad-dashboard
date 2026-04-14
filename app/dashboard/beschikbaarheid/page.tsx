'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { BeschikbaarheidBadge } from '@/components/BeschikbaarheidBadge'
import { statusKleur, type GebruikerStatus, type BeschikbaarheidStatus } from '@/lib/beschikbaarheid'

const F = FONT_FAMILY
const fetcher = (url: string) => fetch(url).then(r => r.json())

/** Initialen uit naam of e-mail */
function initialen(naam: string | null, email: string): string {
  if (naam) {
    const delen = naam.trim().split(/\s+/)
    if (delen.length >= 2) return (delen[0][0] + delen[delen.length - 1][0]).toUpperCase()
    return naam.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

/** Kleur voor avatar op basis van naam (deterministisch) */
const AVATAR_COLORS = [
  { bg: '#dbeafe', fg: '#1d4ed8' }, // blauw
  { bg: '#dcfce7', fg: '#15803d' }, // groen
  { bg: '#fce7f3', fg: '#be185d' }, // roze
  { bg: '#fef3c7', fg: '#92400e' }, // amber
  { bg: '#ede9fe', fg: '#6d28d9' }, // paars
  { bg: '#ffedd5', fg: '#c2410c' }, // oranje
  { bg: '#e0f2fe', fg: '#0369a1' }, // hemelsblauw
  { bg: '#f0fdf4', fg: '#166534' }, // donkergroen
]

function avatarKleur(naam: string | null, email: string) {
  const seed = (naam ?? email).charCodeAt(0) + (naam ?? email).charCodeAt(1 % (naam ?? email).length)
  return AVATAR_COLORS[seed % AVATAR_COLORS.length]
}

const STATUS_VOLGORDE: BeschikbaarheidStatus[] = ['beschikbaar', 'out-of-office', 'buiten-werktijd', 'onbekend']

const STATUS_LABELS: Record<BeschikbaarheidStatus, string> = {
  beschikbaar:     'Beschikbaar',
  'out-of-office': 'Out of office',
  'buiten-werktijd': 'Buiten werktijd',
  onbekend:        'Onbekend',
}

/** Linkerborder-kleur per status (sterker dan badge bg) */
function statusBorderColor(status: BeschikbaarheidStatus): string {
  const { dot } = statusKleur(status)
  return dot
}

function PersonCard({ g, now }: { g: GebruikerStatus; now: Date }) {
  const av = avatarKleur(g.naam, g.email)
  const init = initialen(g.naam, g.email)
  const borderColor = statusBorderColor(g.status)
  const { bg: statusBg } = statusKleur(g.status)

  // Werkdag-info: toon werktijden bij beschikbaar
  const werkInfo = useMemo(() => {
    if (g.status !== 'beschikbaar' || !g.work_schedule) return null
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = days[now.getDay()] as keyof typeof g.work_schedule
    const dag = g.work_schedule[dayName]
    if (!dag?.enabled) return null
    return `${dag.start} – ${dag.end}`
  }, [g.status, g.work_schedule, now])

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md"
      style={{
        border: '1px solid rgba(0,0,0,0.07)',
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: '0 2px 8px rgba(45,69,124,0.05)',
      }}
    >
      {/* Body */}
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: av.bg, color: av.fg, fontFamily: F }}
          aria-hidden
        >
          {init}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: '#1e293b', fontFamily: F }}>
            {g.naam ?? g.email.split('@')[0]}
          </div>
          <div className="text-xs truncate mt-0.5" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
            {g.email}
          </div>

          {/* Status badge */}
          <div className="mt-2.5">
            <BeschikbaarheidBadge
              status={g.status}
              oofStart={g.oof_start}
              oofEnd={g.oof_end}
              nextAvailableLabel={g.next_available_label}
            />
          </div>
        </div>
      </div>

      {/* Footer: werktijden (beschikbaar) of volgende slot */}
      {(werkInfo || g.next_available_label) && (
        <div
          className="px-4 py-2 flex items-center gap-1.5 text-[11px] font-medium border-t"
          style={{
            borderColor: 'rgba(0,0,0,0.06)',
            background: statusBg,
            fontFamily: F,
            color: statusKleur(g.status).fg,
          }}
        >
          {g.status === 'beschikbaar' ? (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Werktijd {werkInfo}
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {g.next_available_label}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact tabelrij voor de lijstweergave */
function PersonRow({ g }: { g: GebruikerStatus }) {
  const av = avatarKleur(g.naam, g.email)
  const init = initialen(g.naam, g.email)
  const borderColor = statusBorderColor(g.status)

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors border-b last:border-b-0"
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
          <div className="text-[11px] mt-0.5 truncate" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
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

export default function BeschikbaarheidDashboardPage() {
  const [zoek, setZoek] = useState('')
  const [weergave, setWeergave] = useState<'kaarten' | 'lijst'>('kaarten')
  const now = useMemo(() => new Date(), [])

  const { data, isLoading, mutate } = useSWR<{ statussen: GebruikerStatus[]; timestamp: string }>(
    '/api/beschikbaarheid/status',
    fetcher,
    { refreshInterval: 60_000 }
  )

  const statussen = data?.statussen ?? []

  // Zoekfilter
  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return statussen
    return statussen.filter(g =>
      (g.naam ?? '').toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q)
    )
  }, [statussen, zoek])

  // Groepeer per status
  const groepen = useMemo(() => {
    const map = new Map<BeschikbaarheidStatus, GebruikerStatus[]>()
    for (const s of STATUS_VOLGORDE) map.set(s, [])
    for (const g of gefilterd) {
      const list = map.get(g.status)
      if (list) list.push(g)
    }
    return STATUS_VOLGORDE
      .map(s => ({ status: s, items: map.get(s) ?? [] }))
      .filter(gr => gr.items.length > 0)
  }, [gefilterd])

  // Tellen voor stat-chips
  const tellen = useMemo(() => ({
    beschikbaar: statussen.filter(g => g.status === 'beschikbaar').length,
    oof: statussen.filter(g => g.status === 'out-of-office').length,
    buiten: statussen.filter(g => g.status === 'buiten-werktijd').length,
  }), [statussen])

  const timestamp = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : null

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
          <span className="text-sm font-semibold" style={{ color: '#1e293b' }}>Beschikbaarheid team</span>

          <div className="ml-auto flex items-center gap-2">
            {timestamp && (
              <span className="text-xs" style={{ color: dashboardUi.textMuted }}>
                Bijgewerkt {timestamp}
              </span>
            )}
            <button
              type="button"
              onClick={() => void mutate()}
              className="rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
              title="Vernieuwen"
              aria-label="Vernieuwen"
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

        {/* Paginakop */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold m-0" style={{ color: DYNAMO_BLUE }}>
              Beschikbaarheid team
            </h1>
            <p className="text-sm m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
              Wie is er vandaag aan het werk?
            </p>
          </div>
          <Link
            href="/dashboard/instellingen/beschikbaarheid"
            className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition hover:opacity-80"
            style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Mijn beschikbaarheid
          </Link>
        </div>

        {/* Stat-chips */}
        {!isLoading && statussen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <StatChip
              color="#16a34a" bg="#dcfce7"
              label={`${tellen.beschikbaar} beschikbaar`}
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>}
            />
            {tellen.oof > 0 && (
              <StatChip
                color="#c2410c" bg="#fff7ed"
                label={`${tellen.oof} out of office`}
                icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              />
            )}
            {tellen.buiten > 0 && (
              <StatChip
                color="#64748b" bg="#f1f5f9"
                label={`${tellen.buiten} buiten werktijd`}
                icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              />
            )}
          </div>
        )}

        {/* Zoekbalk + weergave-toggle */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: dashboardUi.textMuted }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="search"
              placeholder="Zoek op naam of e-mail…"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              className="w-full rounded-xl border pl-9 pr-3 py-2 text-sm outline-none transition focus:border-[#2D457C] focus:ring-2 focus:ring-[#2D457C]/20"
              style={{ borderColor: 'rgba(45,69,124,0.2)', color: '#1e293b', fontFamily: F }}
            />
          </div>
          {/* Weergave-toggle */}
          <div className="flex rounded-xl border overflow-hidden shrink-0" style={{ borderColor: 'rgba(45,69,124,0.2)' }}>
            <button
              type="button"
              onClick={() => setWeergave('kaarten')}
              className="px-3 py-2 transition-colors"
              style={{
                background: weergave === 'kaarten' ? DYNAMO_BLUE : 'white',
                color: weergave === 'kaarten' ? 'white' : DYNAMO_BLUE,
              }}
              title="Kaartweergave"
              aria-pressed={weergave === 'kaarten'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setWeergave('lijst')}
              className="px-3 py-2 transition-colors border-l"
              style={{
                background: weergave === 'lijst' ? DYNAMO_BLUE : 'white',
                color: weergave === 'lijst' ? 'white' : DYNAMO_BLUE,
                borderColor: 'rgba(45,69,124,0.2)',
              }}
              title="Lijstweergave"
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
          <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm font-semibold" style={{ color: '#1e293b', fontFamily: F }}>Nog geen beschikbaarheidsdata</p>
            <p className="text-xs mt-1" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
              Collega&apos;s kunnen hun beschikbaarheid instellen via{' '}
              <Link href="/dashboard/instellingen/beschikbaarheid" className="underline" style={{ color: DYNAMO_BLUE }}>
                Instellingen → Beschikbaarheid
              </Link>
              .
            </p>
          </div>
        ) : gefilterd.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            <p className="text-sm" style={{ color: dashboardUi.textMuted, fontFamily: F }}>Geen resultaten voor &ldquo;{zoek}&rdquo;</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groepen.map(({ status, items }) => (
              <section key={status}>
                {/* Groepkop */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: statusKleur(status).dot }}
                    aria-hidden
                  />
                  <h2 className="text-xs font-bold uppercase tracking-wide m-0" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
                    {STATUS_LABELS[status]}
                  </h2>
                  <span
                    className="text-xs font-semibold rounded-full px-2 py-0.5 leading-none"
                    style={{ background: statusKleur(status).bg, color: statusKleur(status).fg, fontFamily: F }}
                  >
                    {items.length}
                  </span>
                </div>

                {weergave === 'kaarten' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map(g => (
                      <PersonCard key={g.user_id} g={g} now={now} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
                    {items.map(g => (
                      <PersonRow key={g.user_id} g={g} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/* Footer: update-info */}
        {!isLoading && statussen.length > 0 && (
          <p className="text-center text-[11px] pb-2" style={{ color: dashboardUi.textMuted, fontFamily: F }}>
            Automatisch vernieuwd elke minuut · {timestamp && `Laatst om ${timestamp}`}
          </p>
        )}
      </main>
    </div>
  )
}

function StatChip({
  color, bg, label, icon,
}: {
  color: string; bg: string; label: string; icon: React.ReactNode
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
      style={{ background: bg, color, fontFamily: FONT_FAMILY }}
    >
      {icon}
      {label}
    </span>
  )
}
