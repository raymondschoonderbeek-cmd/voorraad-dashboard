'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'

const F = FONT_FAMILY
const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Device {
  id: string
  serial_number: string
  hostname: string | null
  device_type: string | null
  location: string | null
}

interface Licentie {
  id: string
  naam: string
  categorie: string
  leverancier: string
  versie: string | null
  serienummer: string | null
  datum_ingebruik: string | null
}

interface Product {
  id: string
  naam: string
  categorie: string
  leverancier: string
  serienummer: string | null
  datum_ingebruik: string | null
}

interface Gebruiker {
  key: string
  user_id: string | null
  email: string
  naam: string | null
  devices: Device[]
  licenties: Licentie[]
  producten: Product[]
}

const CATEGORIE_KLEUREN: Record<string, { bg: string; fg: string }> = {
  Productiviteit:  { bg: '#dbeafe', fg: '#1d4ed8' },
  Beveiliging:     { bg: '#fce7f3', fg: '#9d174d' },
  Documentbeheer:  { bg: '#fef9c3', fg: '#854d0e' },
  Laptop:          { bg: '#dcfce7', fg: '#15803d' },
  Desktop:         { bg: '#d1fae5', fg: '#065f46' },
  Monitor:         { bg: '#e0f2fe', fg: '#0369a1' },
  Accessoire:      { bg: '#ede9fe', fg: '#6d28d9' },
  Printer:         { bg: '#ffedd5', fg: '#c2410c' },
  Netwerk:         { bg: '#cffafe', fg: '#0e7490' },
  Server:          { bg: '#fee2e2', fg: '#b91c1c' },
  Telefoon:        { bg: '#fef3c7', fg: '#b45309' },
  Overig:          { bg: 'rgba(45,69,124,0.08)', fg: DYNAMO_BLUE },
}

function categorieBadgeStyle(cat: string) {
  return CATEGORIE_KLEUREN[cat] ?? CATEGORIE_KLEUREN['Overig']
}

function prettyEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.split(/[._-]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function displayName(g: Gebruiker): string {
  if (g.naam) return g.naam
  return prettyEmail(g.email)
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function Avatar({ name, external }: { name: string; external: boolean }) {
  const init = name && name !== '—' ? initials(name) : '?'
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold select-none"
      style={{
        background: external ? 'rgba(120,53,15,0.10)' : 'rgba(45,69,124,0.12)',
        color: external ? '#92400e' : DYNAMO_BLUE,
        fontFamily: F,
      }}
    >
      {init}
    </div>
  )
}

function DeviceTypeBadge({ type }: { type: string | null }) {
  if (!type) return null
  const t = type.toLowerCase()
  let bg = 'rgba(45,69,124,0.08)', fg = DYNAMO_BLUE
  if (t.includes('laptop') || t.includes('notebook')) { bg = '#dcfce7'; fg = '#15803d' }
  else if (t.includes('desktop')) { bg = '#d1fae5'; fg = '#065f46' }
  else if (t.includes('telefoon') || t.includes('phone') || t.includes('mobile')) { bg = '#fef3c7'; fg = '#b45309' }
  else if (t.includes('server')) { bg = '#fee2e2'; fg = '#b91c1c' }
  else if (t.includes('tablet')) { bg = '#ede9fe'; fg = '#6d28d9' }
  return (
    <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase tracking-wide" style={{ background: bg, color: fg }}>
      {type}
    </span>
  )
}

function CountBadge({ count, label, color }: { count: number; label: string; color: string }) {
  if (count === 0) return null
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5"
      style={{ background: `${color}18`, color }}
    >
      <span className="font-bold">{count}</span>
      <span className="opacity-75">{label}</span>
    </span>
  )
}

function GebruikerKaart({ g }: { g: Gebruiker }) {
  const [open, setOpen] = useState(false)
  const external = g.user_id === null
  const name = displayName(g)
  const totalAssets = g.devices.length + g.licenties.length + g.producten.length

  return (
    <div
      className="rounded-2xl border bg-white overflow-hidden transition-shadow"
      style={{ borderColor: open ? `${DYNAMO_BLUE}40` : 'rgba(0,0,0,0.07)', boxShadow: open ? `0 0 0 2px ${DYNAMO_BLUE}22` : undefined }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <Avatar name={name} external={external} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate" style={{ color: '#1e293b', fontFamily: F }}>{name}</span>
            {external && (
              <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 uppercase tracking-wide" style={{ background: '#fef3c7', color: '#b45309' }}>
                Geen portal
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5 truncate" style={{ color: dashboardUi.textSubtle }}>{g.email}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <CountBadge count={g.devices.length} label="device(s)" color={DYNAMO_BLUE} />
            <CountBadge count={g.licenties.length} label="licentie(s)" color="#7c3aed" />
            <CountBadge count={g.producten.length} label="product(en)" color="#0369a1" />
            {totalAssets === 0 && (
              <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>Geen assets</span>
            )}
          </div>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className="shrink-0 transition-transform"
          style={{ color: dashboardUi.textSubtle, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>

          {/* Devices */}
          {g.devices.length > 0 && (
            <section>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: dashboardUi.textSubtle }}>
                Devices ({g.devices.length})
              </div>
              <div className="space-y-2">
                {g.devices.map(d => (
                  <div key={d.id} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(45,69,124,0.04)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: DYNAMO_BLUE }} aria-hidden>
                      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: '#1e293b', fontFamily: F }}>
                          {d.hostname ?? d.serial_number}
                        </span>
                        {d.device_type && <DeviceTypeBadge type={d.device_type} />}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-0.5">
                        {d.hostname && (
                          <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>S/N: {d.serial_number}</span>
                        )}
                        {d.location && (
                          <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>📍 {d.location}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Licenties */}
          {g.licenties.length > 0 && (
            <section>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: dashboardUi.textSubtle }}>
                Licenties ({g.licenties.length})
              </div>
              <div className="space-y-2">
                {g.licenties.map(l => {
                  const style = categorieBadgeStyle(l.categorie)
                  return (
                    <div key={l.id + (l.serienummer ?? '')} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(124,58,237,0.04)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: '#7c3aed' }} aria-hidden>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: '#1e293b', fontFamily: F }}>{l.naam}</span>
                          <span className="text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: style.bg, color: style.fg }}>{l.categorie}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-0.5">
                          <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>{l.leverancier}{l.versie ? ` v${l.versie}` : ''}</span>
                          {l.serienummer && <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>S/N: {l.serienummer}</span>}
                          {l.datum_ingebruik && (
                            <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>
                              Vanaf {new Date(l.datum_ingebruik).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Producten */}
          {g.producten.length > 0 && (
            <section>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: dashboardUi.textSubtle }}>
                Producten ({g.producten.length})
              </div>
              <div className="space-y-2">
                {g.producten.map(p => {
                  const style = categorieBadgeStyle(p.categorie)
                  return (
                    <div key={p.id + (p.serienummer ?? '')} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(3,105,161,0.04)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" style={{ color: '#0369a1' }} aria-hidden>
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: '#1e293b', fontFamily: F }}>{p.naam}</span>
                          <span className="text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: style.bg, color: style.fg }}>{p.categorie}</span>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-0.5">
                          <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>{p.leverancier}</span>
                          {p.serienummer && <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>S/N: {p.serienummer}</span>}
                          {p.datum_ingebruik && (
                            <span className="text-xs" style={{ color: dashboardUi.textSubtle }}>
                              Vanaf {new Date(p.datum_ingebruik).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {totalAssets === 0 && (
            <p className="text-sm text-center py-2" style={{ color: dashboardUi.textSubtle }}>Geen assets gekoppeld aan deze gebruiker.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function GebruikersPage() {
  const { data, error, isLoading } = useSWR<{ gebruikers: Gebruiker[] }>('/api/it-cmdb/gebruiker-overzicht', fetcher)
  const [zoek, setZoek] = useState('')

  const gefilterd = useMemo(() => {
    const lijst = data?.gebruikers ?? []
    if (!zoek.trim()) return lijst
    const q = zoek.trim().toLowerCase()
    return lijst.filter(g => {
      if (g.email.toLowerCase().includes(q)) return true
      if (g.naam?.toLowerCase().includes(q)) return true
      if (prettyEmail(g.email).toLowerCase().includes(q)) return true
      if (g.devices.some(d => d.hostname?.toLowerCase().includes(q) || d.serial_number.toLowerCase().includes(q))) return true
      if (g.licenties.some(l => l.naam.toLowerCase().includes(q) || l.leverancier.toLowerCase().includes(q))) return true
      if (g.producten.some(p => p.naam.toLowerCase().includes(q) || p.leverancier.toLowerCase().includes(q))) return true
      return false
    })
  }, [data, zoek])

  const totaalGebruikers = data?.gebruikers.length ?? 0
  const totaalDevices = data?.gebruikers.reduce((s, g) => s + g.devices.length, 0) ?? 0
  const totaalLicenties = data?.gebruikers.reduce((s, g) => s + g.licenties.length, 0) ?? 0
  const totaalProducten = data?.gebruikers.reduce((s, g) => s + g.producten.length, 0) ?? 0

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        {/* Top bar */}
        <div className="px-4 sm:px-6 flex items-center gap-3 py-2 border-b border-white/10 min-h-[44px]">
          <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90 shrink-0">
            ← Portal
          </Link>
          <span className="text-white/50 text-xs select-none">IT CMDB</span>
        </div>
        {/* Tab navigation */}
        <div className="px-4 sm:px-6 flex gap-0 overflow-x-auto scrollbar-none">
          <Link
            href="/dashboard/it-cmdb"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-transparent text-white/55 hover:text-white/85 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Interne Hardware
          </Link>
          <Link
            href="/dashboard/it-cmdb/catalogus"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-transparent text-white/55 hover:text-white/85 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Catalogus
          </Link>
          <Link
            href="/dashboard/it-cmdb/gebruikers"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 border-white text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Gebruikers
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-[1000px] mx-auto w-full space-y-5">

        {/* Kop */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: DYNAMO_BLUE }}>
              Gebruikersoverzicht
            </h1>
            <p className="m-0 mt-1 text-sm" style={{ color: dashboardUi.textMuted }}>
              Bekijk per gebruiker welke devices, producten en licenties ze in bezit hebben.
            </p>
          </div>
        </div>

        {/* Stat chips */}
        {!isLoading && !error && data && (
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Gebruikers', value: totaalGebruikers, color: DYNAMO_BLUE },
              { label: 'Devices', value: totaalDevices, color: '#15803d' },
              { label: 'Licenties', value: totaalLicenties, color: '#7c3aed' },
              { label: 'Producten', value: totaalProducten, color: '#0369a1' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-2xl px-4 py-3 flex flex-col bg-white border" style={{ borderColor: 'rgba(0,0,0,0.07)', minWidth: 90 }}>
                <span className="text-xl font-bold tabular-nums" style={{ color, fontFamily: F }}>{value}</span>
                <span className="text-xs mt-0.5" style={{ color: dashboardUi.textSubtle }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Zoekbalk */}
        <div className="relative">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: dashboardUi.textSubtle }} aria-hidden>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoek op naam, e-mail, device, licentie of product…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none transition"
            style={{
              fontFamily: F,
              color: '#1e293b',
              borderColor: zoek ? DYNAMO_BLUE : 'rgba(0,0,0,0.12)',
              boxShadow: zoek ? `0 0 0 2px ${DYNAMO_BLUE}22` : undefined,
            }}
          />
          {zoek && (
            <button
              type="button"
              onClick={() => setZoek('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs rounded px-1.5 py-0.5 transition hover:opacity-75"
              style={{ color: dashboardUi.textSubtle }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Resultaten label */}
        {zoek && (
          <p className="text-sm" style={{ color: dashboardUi.textSubtle }}>
            {gefilterd.length === 0 ? 'Geen gebruikers gevonden.' : `${gefilterd.length} gebruiker${gefilterd.length !== 1 ? 's' : ''} gevonden`}
          </p>
        )}

        {/* State: loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <span className="inline-block w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
          </div>
        )}

        {/* State: error */}
        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            Fout bij ophalen gebruikers: {error instanceof Error ? error.message : 'Onbekende fout'}
          </div>
        )}

        {/* State: no data */}
        {!isLoading && !error && totaalGebruikers === 0 && (
          <div className="rounded-2xl bg-white border py-12 text-center" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3" style={{ color: dashboardUi.textSubtle }} aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p className="text-sm font-medium" style={{ color: dashboardUi.textMuted }}>Nog geen gebruikers met assets gevonden.</p>
            <p className="text-xs mt-1" style={{ color: dashboardUi.textSubtle }}>Koppel hardware aan gebruikers of synchroniseer de catalogus.</p>
          </div>
        )}

        {/* Gebruikerskaarten */}
        {!isLoading && !error && gefilterd.length > 0 && (
          <div className="space-y-3">
            {gefilterd.map(g => (
              <GebruikerKaart key={g.key} g={g} />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
