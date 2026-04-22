'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { DYNAMO_BLUE, DYNAMO_LOGO, FONT_FAMILY } from '@/lib/theme'
import { CampagneFietsNlMap, type CampagneFietsMapPunt } from '@/components/campagne-fietsen/CampagneFietsNlMap'

const sessionFetcher = (url: string) => fetch(url).then(r => r.json())

type WinkelVoorraad = {
  winkel_id: number
  naam: string
  stad: string | null
  lat: number | null
  lng: number | null
  voorraad: number
  bron: string
  voorraad_referentie?: number | null
  verkocht?: number
  toename?: number
}

type FietsAgg = {
  id: string
  merk: string
  omschrijving_fiets: string
  ean_code: string
  bestelnummer_leverancier: string
  kleur: string
  framemaat: string
  foto_url: string
  active: boolean
  totaal_voorraad: number
  winkels_met_voorraad: number
  totaal_referentie?: number | null
  verkocht_totaal?: number
  toename_totaal?: number
  winkels: WinkelVoorraad[]
}

type VoorraadResponse = {
  fietsen: FietsAgg[]
  winkel_fouten: { winkel_id: number; naam: string; message: string }[]
  synced_at?: string | null
  baseline_recorded_at?: string | null
  error?: string
}

type ProgressState = {
  current: number
  total: number
  winkelNaam?: string
}

const F = "'Outfit', sans-serif"

function formatSyncedAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

/** Handmatige herberekening: POST stream, daarna snapshot opgeslagen */
async function fetchHerberekenSyncStream(
  signal: AbortSignal,
  onMeta: (m: { fietsCount: number; totalWinkels: number }) => void,
  onProgress: (p: ProgressState) => void
): Promise<VoorraadResponse> {
  const res = await fetch('/api/campagne-fietsen/voorraad/sync?stream=1', {
    method: 'POST',
    credentials: 'include',
    signal,
    cache: 'no-store',
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || `HTTP ${res.status}`)
  }
  if (!res.body) throw new Error('Geen response')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: VoorraadResponse | null = null

  const verwerkRegel = (line: string) => {
    if (!line.trim()) return
    const msg = JSON.parse(line) as Record<string, unknown>
    if (msg.type === 'meta') {
      onMeta({
        fietsCount: Number(msg.fietsCount ?? 0),
        totalWinkels: Number(msg.totalWinkels ?? 0),
      })
    }
    if (msg.type === 'progress') {
      onProgress({
        current: Number(msg.current ?? 0),
        total: Number(msg.total ?? 0),
        winkelNaam: typeof msg.winkelNaam === 'string' ? msg.winkelNaam : undefined,
      })
    }
    if (msg.type === 'error') {
      throw new Error(String(msg.message ?? 'Fout bij ophalen'))
    }
    if (msg.type === 'result') {
      result = {
        fietsen: (msg.fietsen as FietsAgg[]) ?? [],
        winkel_fouten: (msg.winkel_fouten as VoorraadResponse['winkel_fouten']) ?? [],
        synced_at: typeof msg.synced_at === 'string' ? msg.synced_at : null,
        baseline_recorded_at:
          typeof msg.baseline_recorded_at === 'string' ? msg.baseline_recorded_at : null,
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) verwerkRegel(line)
  }
  if (buffer.trim()) verwerkRegel(buffer)

  if (!result) throw new Error('Onvolledige server-response')
  return result
}

export default function CampagneFietsenPage() {
  const router = useRouter()
  const supabase = createClient()
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: sessionData, isLoading: sessionLoading } = useSWR<{ campagneFietsenEnabled?: boolean }>(
    '/api/auth/session-info',
    sessionFetcher
  )
  const mayViewCampagneFietsen = sessionData?.campagneFietsenEnabled === true

  const [data, setData] = useState<VoorraadResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ fietsCount: number; totalWinkels: number } | null>(null)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [baselineSaving, setBaselineSaving] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /** Snel: alleen snapshot uit Supabase */
  const loadVoorraad = useCallback(async () => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/campagne-fietsen/voorraad', {
        credentials: 'include',
        signal: ac.signal,
        cache: 'no-store',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const payload = (await res.json()) as VoorraadResponse
      if (!ac.signal.aborted) setData(payload)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      if (!ac.signal.aborted) setIsLoading(false)
    }
  }, [])

  /** Langzaam: alle winkels upstream + snapshot opslaan */
  const herberekenVoorraad = useCallback(async () => {
    const ok = window.confirm(
      'Alle winkels worden opnieuw uit de voorraadbronnen (CycleSoftware, Wilmar, Vendit) opgehaald. Dit kan enkele minuten duren. Doorgaan?'
    )
    if (!ok) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setIsSyncing(true)
    setError(null)
    setMeta(null)
    setProgress(null)

    try {
      const payload = await fetchHerberekenSyncStream(
        ac.signal,
        m => setMeta(m),
        p => setProgress(p)
      )
      if (!ac.signal.aborted) setData(payload)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Herberekening mislukt')
    } finally {
      if (!ac.signal.aborted) {
        setIsSyncing(false)
        setProgress(null)
        setMeta(null)
      }
    }
  }, [])

  const legReferentieVast = useCallback(async () => {
    const ok = window.confirm(
      'De huidige voorraad (laatste snapshot) wordt opgeslagen als referentie. Daarna zie je per fiets en winkel hoeveel er geschat verkocht is (afname) of bijgekomen is t.o.v. die stand. Doorgaan?'
    )
    if (!ok) return
    setBaselineSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/campagne-fietsen/voorraad/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set' }),
        credentials: 'include',
      })
      const payload = (await res.json().catch(() => ({}))) as VoorraadResponse & { error?: string }
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`)
      setData(payload)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Referentie vastleggen mislukt')
    } finally {
      setBaselineSaving(false)
    }
  }, [])

  const wisReferentie = useCallback(async () => {
    if (!data?.baseline_recorded_at) return
    const ok = window.confirm('Referentie wissen? Mutatie-kolommen verdwijnen tot je opnieuw een referentie vastlegt.')
    if (!ok) return
    setBaselineSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/campagne-fietsen/voorraad/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
        credentials: 'include',
      })
      const payload = (await res.json().catch(() => ({}))) as VoorraadResponse & { error?: string }
      if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`)
      setData(payload)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Mislukt')
    } finally {
      setBaselineSaving(false)
    }
  }, [data?.baseline_recorded_at])

  useEffect(() => {
    if (!mayViewCampagneFietsen) return
    loadVoorraad()
    return () => abortRef.current?.abort()
  }, [mayViewCampagneFietsen, loadVoorraad])

  const fietsenSorted = useMemo(() => {
    return [...(data?.fietsen ?? [])].sort((a, b) => {
      const d = b.totaal_voorraad - a.totaal_voorraad
      if (d !== 0) return d
      return a.omschrijving_fiets.localeCompare(b.omschrijving_fiets, 'nl')
    })
  }, [data?.fietsen])

  const winkelFouten = data?.winkel_fouten ?? []

  const progressPct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0

  const syncedLabel = formatSyncedAt(data?.synced_at)

  function puntenVoorFiets(f: FietsAgg): CampagneFietsMapPunt[] {
    return [...f.winkels]
      .sort((a, b) => b.voorraad - a.voorraad || a.naam.localeCompare(b.naam, 'nl'))
      .filter(w => w.voorraad > 0 && w.lat != null && w.lng != null)
      .map(w => ({
        lat: w.lat!,
        lng: w.lng!,
        naam: w.naam,
        stad: w.stad,
        voorraad: w.voorraad,
      }))
  }

  return (
    <div style={{ minHeight: '100%', fontFamily: FONT_FAMILY }} className="text-gray-900">
      <div className="max-w-5xl mx-auto w-full space-y-6" style={{ padding: '24px 28px' }}>
        {!sessionLoading && !mayViewCampagneFietsen && (
          <div className="rounded-2xl p-6 bg-white border border-gray-200 shadow-sm text-center space-y-3">
            <p className="text-gray-800 font-semibold" style={{ fontFamily: F }}>
              Je hebt geen toegang tot deze pagina.
            </p>
            <p className="text-sm text-gray-600">
              Vraag een beheerder om toegang tot Campagnefietsen, of ga terug naar het dashboard.
            </p>
            <Link
              href="/dashboard"
              className="inline-block text-sm font-semibold px-4 py-2 rounded-xl text-white"
              style={{ background: DYNAMO_BLUE, fontFamily: F }}
            >
              Naar dashboard
            </Link>
          </div>
        )}

        {mayViewCampagneFietsen && (
          <div className="rounded-2xl p-5 sm:p-6 text-white shadow-lg" style={{ background: DYNAMO_BLUE }}>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ fontFamily: F }}>
              Campagnefietsen — landelijk overzicht
            </h1>
            <p className="mt-2 text-sm opacity-80 max-w-2xl">
              Voorraad per winkel via dezelfde koppelingen als het voorraaddashboard (CycleSoftware, Wilmar, Vendit). Alleen winkels met voorraad &gt; 0 worden getoond. De getoonde cijfers komen uit een opgeslagen snapshot; gebruik “Herbereken voorraad” om die te verversen.
            </p>
            {!isLoading && data != null && (
              <>
                <p className="mt-3 text-xs opacity-90" style={{ fontFamily: F }}>
                  Laatst bijgewerkt: <strong>{syncedLabel}</strong>
                  {data.synced_at == null && (
                    <span className="block mt-1 font-normal opacity-80">
                      Nog geen sync — kies “Herbereken voorraad”.
                    </span>
                  )}
                </p>
                {data.baseline_recorded_at ? (
                  <p className="mt-2 text-xs opacity-90" style={{ fontFamily: F }}>
                    Referentie (voor mutaties): <strong>{formatSyncedAt(data.baseline_recorded_at)}</strong>
                    <span className="block mt-1 font-normal opacity-80">
                      “Verkocht” = som van afnames t.o.v. die stand per winkel; “Toename” = extra voorraad t.o.v. referentie (herbevoorraading).
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs opacity-80 font-normal" style={{ fontFamily: F }}>
                    Leg optioneel de huidige snapshot vast als referentie om mutaties en geschatte verkoop te zien na latere herberekeningen.
                  </p>
                )}
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadVoorraad()}
                disabled={isLoading || isSyncing || baselineSaving}
                className="text-sm font-semibold px-4 py-2 rounded-xl bg-white/15 border border-white/25 hover:bg-white/25 transition disabled:opacity-50"
              >
                {isLoading ? 'Laden…' : 'Vernieuwen (cache)'}
              </button>
              <button
                type="button"
                onClick={() => herberekenVoorraad()}
                disabled={isLoading || isSyncing || baselineSaving}
                className="text-sm font-semibold px-4 py-2 rounded-xl bg-white text-dynamo-blue border border-white hover:bg-white/95 transition disabled:opacity-50"
                style={{ fontFamily: F }}
              >
                {isSyncing ? 'Bezig met herberekenen…' : 'Herbereken voorraad'}
              </button>
              <button
                type="button"
                onClick={() => legReferentieVast()}
                disabled={isLoading || isSyncing || baselineSaving || data == null}
                className="text-sm font-semibold px-4 py-2 rounded-xl bg-amber-400/90 text-gray-900 border border-amber-300 hover:bg-amber-300 transition disabled:opacity-50"
                style={{ fontFamily: F }}
                title="Slaat de huidige snapshot op als referentie voor vergelijking"
              >
                {baselineSaving ? 'Bezig…' : 'Leg referentie vast (nu)'}
              </button>
              <button
                type="button"
                onClick={() => wisReferentie()}
                disabled={isLoading || isSyncing || baselineSaving || !data?.baseline_recorded_at}
                className="text-sm font-semibold px-4 py-2 rounded-xl bg-white/10 border border-white/25 hover:bg-white/20 transition disabled:opacity-40"
                style={{ fontFamily: F }}
              >
                Wis referentie
              </button>
            </div>
          </div>
        )}

        {mayViewCampagneFietsen && isSyncing && (
          <div
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
              <span className="font-semibold">Herberekenen: voorraad ophalen bij alle winkels</span>
              {meta != null && (
                <span className="text-xs opacity-70 tabular-nums">
                  {meta.fietsCount} fietsen · {meta.totalWinkels} winkels
                </span>
              )}
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{
                  width: `${progress && progress.total > 0 ? progressPct : meta ? 8 : 5}%`,
                  background: DYNAMO_BLUE,
                  minWidth: progress && progress.total > 0 ? undefined : '12%',
                }}
              />
            </div>
            <p className="text-xs text-gray-600" style={{ fontFamily: F }}>
              {progress && progress.total > 0 ? (
                <>
                  {progress.current} / {progress.total} winkels
                  {progress.winkelNaam ? (
                    <>
                      {' '}
                      — <span className="font-medium text-gray-800">{progress.winkelNaam}</span>
                    </>
                  ) : null}
                </>
              ) : meta && meta.totalWinkels === 0 ? (
                'Geen winkels in het systeem.'
              ) : (
                'Bezig met ophalen…'
              )}
            </p>
          </div>
        )}

        {mayViewCampagneFietsen && isLoading && !data && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-2xl bg-white border border-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {mayViewCampagneFietsen && error && (
          <div className="rounded-2xl p-4 bg-red-50 border border-red-100 text-red-800 text-sm">
            {error}
          </div>
        )}

        {mayViewCampagneFietsen && !isLoading && !isSyncing && data && fietsenSorted.length === 0 && (
          <div className="rounded-2xl p-8 text-center bg-white border border-gray-100 text-gray-600">
            Geen actieve campagnefietsen. Voeg fietsen toe onder{' '}
            <Link href="/dashboard/beheer?tab=campagnefietsen" className="font-semibold text-dynamo-blue underline">
              Beheer → Campagnefietsen
            </Link>
            .
          </div>
        )}

        {mayViewCampagneFietsen && data && winkelFouten.length > 0 && (
          <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <summary className="cursor-pointer font-semibold">
              {winkelFouten.length} winkel(s) niet volledig opgehaald (API)
            </summary>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-amber-900/90">
              {winkelFouten.map(f => (
                <li key={f.winkel_id}>
                  <strong>{f.naam}</strong>: {f.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        {mayViewCampagneFietsen && data &&
          fietsenSorted.map(f => {
            const open = openId === f.id
            const hasBaseline = data.baseline_recorded_at != null
            return (
              <article
                key={f.id}
                className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
                  <div className="shrink-0 w-full sm:w-44 aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                    {f.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.foto_url}
                        alt=""
                        className="w-full h-full object-contain cursor-zoom-in hover:opacity-90 transition-opacity"
                        loading="lazy"
                        onClick={() => setLightboxUrl(f.foto_url)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">🚲</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{f.merk}</p>
                        <h2 className="text-lg font-bold leading-snug" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          {f.omschrijving_fiets}
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-4 sm:gap-5 justify-end shrink-0">
                        <div className="text-right min-w-[4.5rem]">
                          <p className="text-2xl font-bold tabular-nums" style={{ color: DYNAMO_BLUE }}>
                            {f.totaal_voorraad}
                          </p>
                          <p className="text-xs text-gray-500">nu (totaal)</p>
                        </div>
                        {hasBaseline && f.totaal_referentie != null && (
                          <>
                            <div className="text-right min-w-[4rem]">
                              <p className="text-xl font-bold tabular-nums text-gray-800">{f.totaal_referentie}</p>
                              <p className="text-xs text-gray-500">referentie</p>
                            </div>
                            <div className="text-right min-w-[4rem]">
                              <p className="text-xl font-bold tabular-nums text-red-700">{f.verkocht_totaal ?? 0}</p>
                              <p className="text-xs text-gray-500">verkocht (geschat)</p>
                            </div>
                            <div className="text-right min-w-[4rem]">
                              <p className="text-xl font-bold tabular-nums text-emerald-800">
                                {(f.toename_totaal ?? 0) > 0 ? `+${f.toename_totaal}` : '0'}
                              </p>
                              <p className="text-xs text-gray-500">toename</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                      <div>
                        <dt className="text-gray-400 text-xs">EAN</dt>
                        <dd className="font-mono text-gray-800">{f.ean_code}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400 text-xs">Bestelnr lev.</dt>
                        <dd className="font-mono text-gray-800 truncate">{f.bestelnummer_leverancier || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400 text-xs">Kleur</dt>
                        <dd className="text-gray-800">{f.kleur || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400 text-xs">Framemaat</dt>
                        <dd className="text-gray-800">{f.framemaat || '—'}</dd>
                      </div>
                    </dl>
                    <p className="text-sm text-gray-600">
                      <strong className="text-gray-800">{f.winkels_met_voorraad}</strong> winkel(s) met voorraad
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : f.id)}
                      className="text-sm font-semibold text-dynamo-blue hover:underline"
                    >
                      {open ? 'Verberg detail & kaart' : 'Toon detail per winkel & kaart'}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100 p-4 sm:p-5 space-y-5 bg-gray-50/50">
                    <CampagneFietsNlMap punten={puntenVoorFiets(f)} height={280} />

                    {f.winkels.length === 0 ? (
                      <p className="text-sm text-gray-500">Nergens voorraad gevonden voor deze barcode.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-sm text-left text-gray-900">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-4 py-2 font-semibold text-gray-700">Winkel</th>
                              <th className="px-4 py-2 font-semibold text-gray-700">Plaats</th>
                              <th className="px-4 py-2 font-semibold text-gray-700">Bron</th>
                              {hasBaseline && (
                                <th className="px-4 py-2 font-semibold text-gray-700 text-right">Ref.</th>
                              )}
                              <th className="px-4 py-2 font-semibold text-gray-700 text-right">Nu</th>
                              {hasBaseline && (
                                <>
                                  <th className="px-4 py-2 font-semibold text-gray-700 text-right">Verkocht</th>
                                  <th className="px-4 py-2 font-semibold text-gray-700 text-right">Toename</th>
                                </>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {[...f.winkels]
                              .sort((a, b) => b.voorraad - a.voorraad || a.naam.localeCompare(b.naam, 'nl'))
                              .map(w => (
                              <tr key={w.winkel_id} className="border-b border-gray-50 hover:bg-gray-50/80">
                                <td className="px-4 py-2 font-medium" style={{ color: DYNAMO_BLUE }}>
                                  {w.naam}
                                </td>
                                <td className="px-4 py-2 text-gray-700">{w.stad ?? '—'}</td>
                                <td className="px-4 py-2">
                                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                                    {w.bron}
                                  </span>
                                </td>
                                {hasBaseline && (
                                  <td className="px-4 py-2 text-right tabular-nums text-gray-800">
                                    {w.voorraad_referentie ?? '—'}
                                  </td>
                                )}
                                <td className="px-4 py-2 text-right font-bold tabular-nums text-gray-950">{w.voorraad}</td>
                                {hasBaseline && (
                                  <>
                                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-red-800">
                                      {w.verkocht ?? 0}
                                    </td>
                                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-900">
                                      {(w.toename ?? 0) > 0 ? `+${w.toename}` : '0'}
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain"
            style={{ maxHeight: '90vh', maxWidth: '90vw' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition text-xl"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            aria-label="Sluiten"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
