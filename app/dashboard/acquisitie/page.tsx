'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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

const FASE_KLEUR: Record<string, string> = {
  'Vervolg gesprek': '#16a34a',
  'Eerste contact': '#d97706',
  'Geen interesse': '#dc2626',
}

function faseKleur(fase: string): string {
  return FASE_KLEUR[fase] ?? DYNAMO_BLUE
}

// Module-level cache — overleeft tab-wissels en component-unmounts
const _geocodeCache = new Map<string, [number, number]>()

type WinkelGroep = {
  naam: string
  woonplaats: string
  straat: string
  postcode: string
  fase: string
  aantalContactmomenten: number
  datumLaatst: string
}

// ─── Kaartcomponent ────────────────────────────────────────────────────────────
function AcquisitieKaart({ items }: { items: ContactMoment[] }) {
  const mapRef = useRef<any>(null)
  const mapIdRef = useRef(`acq-kaart-${Math.random().toString(36).slice(2)}`)
  const [geocodeerStatus, setGeocodeerStatus] = useState<'idle' | 'bezig' | 'klaar'>('idle')
  const [gecodeerd, setGecodeerd] = useState(0)

  const winkelGroepen = useMemo<WinkelGroep[]>(() => {
    const groepen = new Map<string, WinkelGroep>()
    for (const item of items) {
      const naam = String(item.Winkel ?? '').trim()
      const woonplaats = String(item.Woonplaats ?? '').trim()
      if (!naam || !woonplaats) continue
      const key = `${naam}__${woonplaats}`
      if (!groepen.has(key)) {
        groepen.set(key, {
          naam,
          woonplaats,
          straat:   String(item.Straat   ?? '').trim(),
          postcode: String(item.Postcode ?? '').trim(),
          fase: String(item.Gespreksfase ?? ''),
          aantalContactmomenten: 0,
          datumLaatst: String(item.Datumcontact ?? ''),
        })
      }
      const g = groepen.get(key)!
      g.aantalContactmomenten++
      if (String(item.Datumcontact ?? '') > g.datumLaatst) {
        g.datumLaatst = String(item.Datumcontact ?? '')
        g.fase = String(item.Gespreksfase ?? '')
      }
    }
    return [...groepen.values()]
  }, [items])

  // Geocodeer alle unieke winkels op volledig adres via Nominatim
  const geocodeSleutels = useMemo(
    () => winkelGroepen.map(g => `${g.straat}__${g.postcode}__${g.woonplaats}`),
    [winkelGroepen],
  )

  useEffect(() => {
    if (winkelGroepen.length === 0) return
    const teGeocoderen = winkelGroepen.filter(g => !_geocodeCache.has(`${g.straat}__${g.postcode}__${g.woonplaats}`))
    if (teGeocoderen.length === 0) { setGeocodeerStatus('klaar'); return }

    setGeocodeerStatus('bezig')
    let gestopt = false

    async function geocodeerAlles() {
      for (let i = 0; i < teGeocoderen.length; i++) {
        if (gestopt) break
        const g = teGeocoderen[i]
        const cacheKey = `${g.straat}__${g.postcode}__${g.woonplaats}`
        try {
          // Probeer eerst op volledig adres, dan op postcode, dan op woonplaats
          const queries = [
            g.straat && g.postcode ? `${g.straat}, ${g.postcode} ${g.woonplaats}, Nederland` : null,
            g.postcode ? `${g.postcode}, Nederland` : null,
            `${g.woonplaats}, Nederland`,
          ].filter(Boolean) as string[]

          for (const q of queries) {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
              { headers: { 'Accept-Language': 'nl' } },
            )
            const data = await res.json()
            if (data[0]) {
              _geocodeCache.set(cacheKey, [parseFloat(data[0].lat), parseFloat(data[0].lon)])
              break
            }
            await new Promise(r => setTimeout(r, 1100))
          }
          setGecodeerd(i + 1)
        } catch {}
        await new Promise(r => setTimeout(r, 1100))
      }
      if (!gestopt) setGeocodeerStatus('klaar')
    }

    void geocodeerAlles()
    return () => { gestopt = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodeSleutels.join(',')])

  // Bouw/herbouw de kaart zodra geocoding klaar is
  useEffect(() => {
    if (geocodeerStatus !== 'klaar') return
    if (typeof window === 'undefined') return

    const mapId = mapIdRef.current

    function initMap() {
      const L = (window as any).L
      if (!L) return
      const mapEl = document.getElementById(mapId)
      if (!mapEl) return

      // Verwijder bestaande kaart
      if ((mapEl as any)._leaflet_id) {
        try { mapRef.current?.remove() } catch {}
        mapRef.current = null
        ;(mapEl as any)._leaflet_id = undefined
        mapEl.innerHTML = ''
      }

      const map = L.map(mapId, { zoomControl: true, scrollWheelZoom: false })
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map)

      const bounds: [number, number][] = []

      for (const groep of winkelGroepen) {
        const cacheKey = `${groep.straat}__${groep.postcode}__${groep.woonplaats}`
        const coords = _geocodeCache.get(cacheKey)
        if (!coords) continue

        const kleur = faseKleur(groep.fase)
        const letter = groep.naam.charAt(0).toUpperCase()
        const icon = L.divIcon({
          html: `<div style="background:${kleur};width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;"><span style="transform:rotate(45deg);color:white;font-size:12px;font-weight:700;line-height:26px;">${letter}</span></div>`,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        })

        const datum = groep.datumLaatst
          ? new Date(groep.datumLaatst).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
          : '—'

        const marker = L.marker(coords, { icon })
        marker.addTo(map)
        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:180px;padding:2px">
            <div style="font-weight:700;color:${DYNAMO_BLUE};font-size:13px;margin-bottom:4px">${groep.naam}</div>
            <div style="color:#6b7280;font-size:11px;margin-bottom:6px">📍 ${[groep.straat, groep.postcode, groep.woonplaats].filter(Boolean).join(' · ')}</div>
            <div style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${kleur}20;color:${kleur};margin-bottom:6px">${groep.fase || '—'}</div>
            <div style="color:#6b7280;font-size:11px">Laatste contact: ${datum}</div>
            <div style="color:#6b7280;font-size:11px">${groep.aantalContactmomenten} contactmoment${groep.aantalContactmomenten !== 1 ? 'en' : ''}</div>
          </div>`,
        )
        bounds.push(coords)
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] })
      } else {
        map.setView([52.1, 5.3], 7)
      }
    }

    if ((window as any).L) {
      initMap()
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = initMap
      document.head.appendChild(script)
    }

    return () => {
      try { mapRef.current?.remove() } catch {}
      mapRef.current = null
    }
  }, [geocodeerStatus, winkelGroepen])

  const totaalTeGeocoderen = winkelGroepen.filter(g => !_geocodeCache.has(`${g.straat}__${g.postcode}__${g.woonplaats}`)).length

  return (
    <div className="rounded-[10px] overflow-hidden border" style={{ backgroundColor: 'var(--drg-card)', borderColor: 'var(--drg-line)' }}>
      {/* Legenda */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-4" style={{ borderBottom: '1px solid var(--drg-line)' }}>
        {Object.entries(FASE_KLEUR).map(([fase, kleur]) => (
          <div key={fase} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: kleur }} />
            <span className="text-xs" style={{ color: 'var(--drg-text-2)' }}>{fase}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DYNAMO_BLUE }} />
          <span className="text-xs" style={{ color: 'var(--drg-text-2)' }}>Overig</span>
        </div>
        {geocodeerStatus === 'bezig' && (
          <span className="text-xs ml-auto" style={{ color: 'var(--drg-text-3)' }}>
            Locaties ophalen… {gecodeerd}/{totaalTeGeocoderen}
          </span>
        )}
      </div>

      {/* Kaart */}
      <div id={mapIdRef.current} style={{ height: 520 }} />

      {geocodeerStatus === 'klaar' && winkelGroepen.filter(g => _geocodeCache.has(g.woonplaats)).length === 0 && (
        <div className="p-6 text-center text-sm" style={{ color: 'var(--drg-text-2)' }}>
          Geen locaties gevonden. Controleer of de woonplaatsnamen kloppen.
        </div>
      )}
    </div>
  )
}

// ─── Hoofdpagina ───────────────────────────────────────────────────────────────
export default function AcquisitievePage() {
  const [filters, setFilters] = useState({ search: '' })
  const [actievTabblad, setActievTabblad] = useState<'tabel' | 'kaart'>('tabel')

  const { data, isLoading, error } = useSWR<ApiResponse>(
    '/api/acquisitie',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60 * 1000 },
  )

  const items = useMemo(() => parseContactMoments(data?.data), [data])

  const filtered = useMemo(() => {
    if (!filters.search) return items
    const needle = filters.search.toLowerCase()
    return items.filter(item =>
      Object.values(item)
        .map(v => String(v ?? '').toLowerCase())
        .join(' ')
        .includes(needle),
    )
  }, [items, filters.search])

  const stats = useMemo(() => {
    const uniekeWinkels = new Set(items.map(i => String(i.Winkel ?? ''))).size
    const faseCount = items.reduce<Record<string, number>>((acc, i) => {
      const f = String(i.Gespreksfase ?? 'Onbekend')
      acc[f] = (acc[f] ?? 0) + 1
      return acc
    }, {})
    return { total: items.length, uniekeWinkels, faseCount }
  }, [items])

  const columns = useMemo(() => {
    if (items.length === 0) return []
    return Object.keys(items[0]).filter(k => k !== 'id')
  }, [items])

  const handleSearch = useCallback((value: string) => setFilters(prev => ({ ...prev, search: value })), [])
  const handleReset = useCallback(() => setFilters({ search: '' }), [])

  const tabStyle = (actief: boolean) => ({
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: actief ? 600 : 500,
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    background: actief ? 'var(--drg-card)' : 'transparent',
    color: actief ? DYNAMO_BLUE : 'var(--drg-text-2)',
    border: actief ? '1px solid var(--drg-line)' : '1px solid transparent',
    borderBottom: actief ? '1px solid var(--drg-card)' : '1px solid transparent',
    marginBottom: -1,
    transition: 'all 0.15s',
  })

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--drg-bg)' }}>
      {/* Topbar */}
      <div className="sticky top-0 z-40" style={{ backgroundColor: 'var(--drg-card)', borderBottom: '1px solid var(--drg-line)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="p-2 rounded-lg hover:opacity-70 transition-opacity" style={{ backgroundColor: 'var(--drg-bg)' }} aria-label="Terug naar dashboard">
            <IconArrowLeft />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--drg-ink)' }}>Contactmomenten Acquisitie</h1>
            <p className="text-sm" style={{ color: 'var(--drg-text-2)' }}>SharePoint: AcquisitieNederland</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Fout */}
        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'rgba(220,38,38,0.1)', borderLeft: '4px solid var(--drg-danger)' }}>
            <p style={{ color: 'var(--drg-danger)', fontWeight: 500 }}>
              Fout bij laden: {error instanceof Error ? error.message : 'Onbekende fout'}
            </p>
          </div>
        )}

        {/* Laden */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block" style={{ color: DYNAMO_BLUE }}>
              <p className="mb-2">Data laden…</p>
              <div className="animate-spin w-8 h-8 rounded-full border-2 border-opacity-30 border-current border-t-current" />
            </div>
          </div>
        )}

        {/* Leeg */}
        {!isLoading && items.length === 0 && !error && (
          <div className="text-center py-12 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', padding: '3rem' }}>
            <p className="text-lg font-medium" style={{ color: 'var(--drg-ink)' }}>Geen contactmomenten gevonden</p>
            <p style={{ color: 'var(--drg-text-2)' }}>SharePoint-koppeling is misschien niet geconfigureerd.</p>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--drg-text-2)' }}>Contactmomenten</p>
                <p className="text-3xl font-bold" style={{ color: DYNAMO_BLUE }}>{stats.total}</p>
              </div>
              <div className="p-4 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--drg-text-2)' }}>Unieke winkels</p>
                <p className="text-3xl font-bold" style={{ color: DYNAMO_BLUE }}>{stats.uniekeWinkels}</p>
              </div>
              {Object.entries(FASE_KLEUR).map(([fase, kleur]) => (
                <div key={fase} className="p-4 rounded-[10px]" style={{ backgroundColor: 'var(--drg-card)', border: `1px solid var(--drg-line)` }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--drg-text-2)' }}>{fase}</p>
                  <p className="text-3xl font-bold" style={{ color: kleur }}>{stats.faseCount[fase] ?? 0}</p>
                </div>
              ))}
            </div>

            {/* Tabs + zoeken */}
            <div className="mb-0 flex items-end justify-between gap-4" style={{ borderBottom: '1px solid var(--drg-line)' }}>
              <div className="flex items-end gap-1">
                <button style={tabStyle(actievTabblad === 'tabel')} onClick={() => setActievTabblad('tabel')}>Tabel</button>
                <button style={tabStyle(actievTabblad === 'kaart')} onClick={() => setActievTabblad('kaart')}>Kaart</button>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <input
                  type="text"
                  placeholder="Zoeken…"
                  value={filters.search}
                  onChange={e => handleSearch(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--drg-line)', backgroundColor: 'var(--drg-bg)', color: 'var(--drg-ink)', width: 200 }}
                />
                {filters.search && (
                  <button onClick={handleReset} className="px-3 py-1.5 rounded-lg text-sm hover:opacity-70" style={{ backgroundColor: 'var(--drg-bg)', color: 'var(--drg-text-2)', border: '1px solid var(--drg-line)' }}>
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Tabel — altijd in DOM, verborgen als kaart actief */}
            <div style={{ display: actievTabblad === 'tabel' ? 'block' : 'none' }}>
              <div className="rounded-b-[10px] overflow-hidden" style={{ backgroundColor: 'var(--drg-card)', border: '1px solid var(--drg-line)', borderTop: 'none' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ backgroundColor: 'var(--drg-bg)', borderBottom: '1px solid var(--drg-line)' }}>
                        {columns.map(col => (
                          <th key={col} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: 'var(--drg-ink)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                            {decodeSPKolomnaam(col)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 200).map((item, idx) => (
                        <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? 'var(--drg-card)' : 'var(--drg-bg)', borderBottom: '1px solid var(--drg-line)' }}>
                          {columns.map(col => (
                            <td key={col} className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--drg-ink)' }}>
                              {col === 'Gespreksfase' ? (
                                <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: `${faseKleur(String(item[col] ?? ''))}20`, color: faseKleur(String(item[col] ?? '')) }}>
                                  {String(item[col] ?? '—')}
                                </span>
                              ) : formatCelWaarde(item[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 200 && (
                  <div className="px-4 py-3 text-center text-sm" style={{ backgroundColor: 'var(--drg-bg)', color: 'var(--drg-text-2)' }}>
                    {filtered.length} items — verfijn je zoekopdracht om meer te zien.
                  </div>
                )}
              </div>
            </div>

            {/* Kaart — altijd in DOM, verborgen als tabel actief */}
            <div style={{ display: actievTabblad === 'kaart' ? 'block' : 'none' }}>
              <AcquisitieKaart items={filtered} />
            </div>

            <div className="mt-4 text-center text-xs" style={{ color: 'var(--drg-text-3)' }}>
              Auto-refresh elke 5 minuten · Laatste update: {new Date().toLocaleTimeString('nl-NL')}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
