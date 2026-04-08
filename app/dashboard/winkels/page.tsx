'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { DYNAMO_BLUE, DYNAMO_LOGO, dashboardUi } from '@/lib/theme'
import { WinkelKaart, WinkelKaartItem } from '@/components/WinkelKaart'
import type { Winkel } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const F = "'Outfit', sans-serif"

function isBikeTotaal(naam: string) { return /bike\s*totaal/i.test(naam) }

export default function WinkelsPage() {
  const router = useRouter()
  const { data: winkelsData = [], isLoading: winkelsLoading, mutate: mutateWinkels } = useSWR<Winkel[]>('/api/winkels', fetcher, { revalidateOnFocus: true })
  const winkels = Array.isArray(winkelsData) ? winkelsData : []

  const { data: favorietenData, mutate: mutateFavorieten } = useSWR<{ winkel_ids: number[] }>('/api/favorieten', fetcher)
  const favorieten = Array.isArray(favorietenData?.winkel_ids) ? favorietenData.winkel_ids : []

  const { data: sessionData } = useSWR<{
    isAdmin?: boolean
    allowedCountries?: ('Netherlands' | 'Belgium')[] | null
  }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const allowedCountries = sessionData?.allowedCountries ?? null

  const winkelsVoorGebruiker = useMemo(() => {
    if (!allowedCountries || allowedCountries.length === 0) return winkels
    return winkels.filter(w => !w.land || allowedCountries.includes(w.land))
  }, [winkels, allowedCountries])

  const [kaartFilterLand, setKaartFilterLand] = useState<'alle' | 'Netherlands' | 'Belgium'>('alle')
  const [kaartFilterKassaPakket, setKaartFilterKassaPakket] = useState<'alle' | 'cyclesoftware' | 'wilmar' | 'vendit'>('alle')
  const [kaartFilterBikeTotaal, setKaartFilterBikeTotaal] = useState<'alle' | 'ja' | 'nee'>('alle')
  const [quickZoek, setQuickZoek] = useState('')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState<{ bijgewerkt: number; totaal: number; mislukt: { id: number; naam: string }[]; zonderAdres: { id: number; naam: string }[] } | null>(null)

  const winkelsGefilterd = useMemo(() => {
    return winkelsVoorGebruiker.filter(w => {
      if (kaartFilterLand !== 'alle' && w.land !== kaartFilterLand) return false
      if (kaartFilterKassaPakket !== 'alle') {
        const at = w.api_type ?? (w.wilmar_organisation_id && w.wilmar_branch_id ? 'wilmar' : 'cyclesoftware')
        if (kaartFilterKassaPakket === 'vendit') {
          if (at !== 'vendit' && at !== 'vendit_api') return false
        } else if (at !== kaartFilterKassaPakket) return false
      }
      if (kaartFilterBikeTotaal !== 'alle') {
        const bt = isBikeTotaal(w.naam)
        if (kaartFilterBikeTotaal === 'ja' && !bt) return false
        if (kaartFilterBikeTotaal === 'nee' && bt) return false
      }
      return true
    })
  }, [winkelsVoorGebruiker, kaartFilterLand, kaartFilterKassaPakket, kaartFilterBikeTotaal])

  const quickPick = useMemo(() => {
    const q = quickZoek.trim().toLowerCase()
    if (!q) return [] as Winkel[]
    return winkelsVoorGebruiker.filter(w => {
      const blob = [w.naam, w.stad, w.postcode, w.straat].map(s => String(s ?? '').toLowerCase()).join(' ')
      return blob.includes(q)
    }).slice(0, 8)
  }, [quickZoek, winkelsVoorGebruiker])

  const kaartFiltersActief = kaartFilterLand !== 'alle' || kaartFilterKassaPakket !== 'alle' || kaartFilterBikeTotaal !== 'alle'
  const showKaartFilterEmpty = !winkelsLoading && winkelsVoorGebruiker.length > 0 && winkelsGefilterd.length === 0

  function resetKaartFilters() {
    setKaartFilterLand('alle')
    setKaartFilterKassaPakket('alle')
    setKaartFilterBikeTotaal('alle')
  }

  function selecteerWinkel(w: Winkel) {
    router.push(`/dashboard?winkel=${w.id}`)
  }

  async function toggleFavoriet(id: number) {
    const res = await fetch('/api/favorieten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winkel_id: id }),
    })
    if (res.ok) await mutateFavorieten()
  }

  const haalLocatiesOp = useCallback(async () => {
    setGeocodeLoading(true)
    setGeocodeResult(null)
    try {
      const res = await fetch('/api/winkels/geocode', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (data.bijgewerkt != null) await mutateWinkels()
        setGeocodeResult({ bijgewerkt: data.bijgewerkt ?? 0, totaal: data.totaal ?? 0, mislukt: data.mislukt ?? [], zonderAdres: data.zonderAdres ?? [] })
      }
    } finally {
      setGeocodeLoading(false)
    }
  }, [mutateWinkels])

  const haalBelgieLocatiesOp = useCallback(async () => {
    setGeocodeLoading(true)
    setGeocodeResult(null)
    try {
      const res = await fetch('/api/winkels/geocode?force_belgium=1', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (data.bijgewerkt != null) await mutateWinkels()
        setGeocodeResult({ bijgewerkt: data.bijgewerkt ?? 0, totaal: data.totaal ?? 0, mislukt: data.mislukt ?? [], zonderAdres: data.zonderAdres ?? [] })
      }
    } finally {
      setGeocodeLoading(false)
    }
  }, [mutateWinkels])

  const WINKEL_KLEUREN = ['#2D457C','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#65a30d','#db2777'] as const

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-center gap-2 py-2 min-h-[56px]">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0 hover:opacity-90 transition" style={{ borderRight: '1px solid rgba(255,255,255,0.07)', paddingRight: '16px', marginRight: '4px' }}>
            <img src={DYNAMO_LOGO} alt="DRG Portal" className="h-7 w-auto object-contain" />
          </Link>
          <span className="text-white text-sm font-semibold">Winkels &amp; vestigingen</span>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5 max-w-[1400px] mx-auto w-full space-y-6">

        {/* Kop + statistieken */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: DYNAMO_BLUE }}>Winkels &amp; vestigingen</h1>
            <p className="m-0 mt-1 text-sm" style={{ color: dashboardUi.textMuted }}>
              Kies een vestiging om de voorraad te bekijken, of markeer winkels als favoriet.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            {[
              { label: 'Totaal', value: winkelsVoorGebruiker.length },
              { label: 'Favorieten', value: favorieten.filter(id => winkelsVoorGebruiker.some(w => w.id === id)).length },
              { label: 'Op kaart', value: winkelsGefilterd.filter(w => w.lat && w.lng).length },
            ].map(s => (
              <div key={s.label} className="rounded-xl px-4 py-2.5 text-center" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.08)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
                <div className="text-xs font-semibold uppercase" style={{ color: 'rgba(45,69,124,0.4)', letterSpacing: '0.08em' }}>{s.label}</div>
                <div className="text-xl font-bold mt-0.5" style={{ color: DYNAMO_BLUE, letterSpacing: '-0.02em' }}>
                  {winkelsLoading ? '…' : s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Zoek */}
        {winkelsVoorGebruiker.length > 0 && (
          <div className="relative max-w-md">
            <label htmlFor="winkel-zoek" className="sr-only">Zoek winkel op naam, plaats of postcode</label>
            <input
              id="winkel-zoek"
              type="search"
              autoComplete="off"
              value={quickZoek}
              onChange={e => setQuickZoek(e.target.value)}
              placeholder="Zoek op naam, plaats of postcode…"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={{ background: 'white', border: `1px solid ${dashboardUi.borderSoft}`, color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
            />
            {quickPick.length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-xl border bg-white py-1 shadow-lg"
                style={{ borderColor: 'rgba(45,69,124,0.12)' }}
                role="listbox"
                aria-label="Zoekresultaten winkels"
              >
                {quickPick.map(w => (
                  <li key={w.id} role="option">
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-sm transition hover:bg-blue-50"
                      style={{ fontFamily: F, color: DYNAMO_BLUE }}
                      onClick={() => { selecteerWinkel(w); setQuickZoek('') }}
                    >
                      <span className="font-semibold">{w.naam}</span>
                      {(w.stad || w.postcode) && (
                        <span className="block text-xs mt-0.5" style={{ color: dashboardUi.textMuted }}>
                          {[w.stad, w.postcode].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={kaartFilterLand} onChange={e => setKaartFilterLand(e.target.value as typeof kaartFilterLand)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(45,69,124,0.12)', color: 'rgba(45,69,124,0.8)', fontFamily: F }}>
            <option value="alle">Alle landen</option>
            <option value="Netherlands">Nederland</option>
            <option value="Belgium">België</option>
          </select>
          <select value={kaartFilterKassaPakket} onChange={e => setKaartFilterKassaPakket(e.target.value as typeof kaartFilterKassaPakket)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(45,69,124,0.12)', color: 'rgba(45,69,124,0.8)', fontFamily: F }}>
            <option value="alle">Kassa pakket: alle</option>
            <option value="cyclesoftware">CycleSoftware</option>
            <option value="wilmar">Wilmar</option>
            <option value="vendit">Vendit</option>
          </select>
          <select value={kaartFilterBikeTotaal} onChange={e => setKaartFilterBikeTotaal(e.target.value as typeof kaartFilterBikeTotaal)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium border" style={{ background: 'white', borderColor: 'rgba(45,69,124,0.12)', color: 'rgba(45,69,124,0.8)', fontFamily: F }}>
            <option value="alle">Bike Totaal: alle</option>
            <option value="ja">Bike Totaal: ja</option>
            <option value="nee">Bike Totaal: nee</option>
          </select>
          {kaartFiltersActief && (
            <button type="button" onClick={resetKaartFilters} className="rounded-lg px-3 py-1.5 text-xs font-semibold border transition hover:opacity-90" style={{ background: 'rgba(45,69,124,0.06)', borderColor: 'rgba(45,69,124,0.15)', color: DYNAMO_BLUE, fontFamily: F }}>
              Alles tonen
            </button>
          )}
          <span className="text-xs" style={{ color: dashboardUi.textSubtle, fontFamily: F }}>
            {winkelsLoading ? 'Laden…' : `${winkelsGefilterd.filter(w => w.lat && w.lng).length} van ${winkelsGefilterd.length} op kaart`}
          </span>
        </div>

        {/* Kaart */}
        <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: '0 4px 24px rgba(45,69,124,0.08)', border: `1px solid ${dashboardUi.borderSoft}` }}>
          {showKaartFilterEmpty && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ background: 'rgba(45,69,124,0.06)', borderColor: 'rgba(45,69,124,0.1)' }}>
              <p className="m-0 text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Geen locaties met deze filters</p>
              <button type="button" onClick={resetKaartFilters} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 shrink-0" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                Filters resetten
              </button>
            </div>
          )}
          {winkelsLoading ? (
            <div className="flex items-center justify-center gap-3 px-4 py-16" style={{ background: 'rgba(45,69,124,0.06)' }} role="status">
              <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
              <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Winkels laden…</span>
            </div>
          ) : winkelsGefilterd.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
              {winkelsVoorGebruiker.length === 0 ? 'Geen locaties gekoppeld aan dit account.' : 'Geen locaties binnen deze filters.'}
            </div>
          ) : (
            <WinkelKaart
              winkels={winkelsGefilterd}
              onSelecteer={selecteerWinkel}
              onGeocode={haalLocatiesOp}
              onGeocodeBelgium={haalBelgieLocatiesOp}
              isAdmin={isAdmin}
              geocodeLoading={geocodeLoading}
              geocodeResult={geocodeResult}
              onDismissGeocodeResult={() => setGeocodeResult(null)}
            />
          )}
        </div>

        {/* Winkelkaarten */}
        {winkelsLoading ? (
          <div aria-busy="true">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="rounded-2xl animate-pulse" style={{ height: 112, background: 'rgba(45,69,124,0.06)', border: '1px solid rgba(45,69,124,0.08)' }} />
              ))}
            </div>
          </div>
        ) : winkelsGefilterd.length > 0 ? (
          <div className="space-y-6">
            {favorieten.filter(id => winkelsGefilterd.some(w => w.id === id)).length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: DYNAMO_BLUE, fontFamily: F }}>★ Mijn winkels</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(45,69,124,0.2)' }} />
                  <span style={{ fontSize: '11px', color: 'rgba(45,69,124,0.3)', fontFamily: F }}>
                    {winkelsGefilterd.filter(w => favorieten.includes(w.id)).length} favoriet{winkelsGefilterd.filter(w => favorieten.includes(w.id)).length !== 1 ? 'en' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {winkelsGefilterd.filter(w => favorieten.includes(w.id)).map(w => (
                    <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[winkelsGefilterd.indexOf(w) % WINKEL_KLEUREN.length]} favoriet={true} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Alle winkels</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(45,69,124,0.08)' }} />
                <span style={{ fontSize: '11px', color: 'rgba(45,69,124,0.3)', fontFamily: F }}>{winkelsGefilterd.length} locaties</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {winkelsGefilterd.map((w, i) => (
                  <WinkelKaartItem key={w.id} w={w} kleur={WINKEL_KLEUREN[i % WINKEL_KLEUREN.length]} favoriet={favorieten.includes(w.id)} onSelecteer={selecteerWinkel} onToggleFavoriet={toggleFavoriet} />
                ))}
              </div>
            </div>
          </div>
        ) : null}

      </main>
    </div>
  )
}
