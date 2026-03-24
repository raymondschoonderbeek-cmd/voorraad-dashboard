'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { DYNAMO_BLUE, DYNAMO_LOGO, FONT_FAMILY } from '@/lib/theme'
import { CampagneFietsNlMap, type CampagneFietsMapPunt } from '@/components/campagne-fietsen/CampagneFietsNlMap'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type WinkelVoorraad = {
  winkel_id: number
  naam: string
  stad: string | null
  lat: number | null
  lng: number | null
  voorraad: number
  bron: string
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
  winkels: WinkelVoorraad[]
}

type VoorraadResponse = {
  fietsen: FietsAgg[]
  winkel_fouten: { winkel_id: number; naam: string; message: string }[]
  error?: string
}

const F = "'Outfit', sans-serif"

export default function CampagneFietsenPage() {
  const router = useRouter()
  const supabase = createClient()
  const [openId, setOpenId] = useState<string | null>(null)

  const { data: sessionData, isLoading: sessionLoading } = useSWR<{ campagneFietsenEnabled?: boolean }>(
    '/api/auth/session-info',
    fetcher
  )
  const mayViewCampagneFietsen = sessionData?.campagneFietsenEnabled === true

  const { data, error, isLoading, mutate } = useSWR<VoorraadResponse>(
    mayViewCampagneFietsen ? '/api/campagne-fietsen/voorraad' : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  )

  const fietsen = data?.fietsen ?? []
  const winkelFouten = data?.winkel_fouten ?? []

  function puntenVoorFiets(f: FietsAgg): CampagneFietsMapPunt[] {
    return f.winkels
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
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb', fontFamily: FONT_FAMILY }}>
      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50 shadow-md">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-white hover:opacity-90 min-w-0">
            <img src={DYNAMO_LOGO} alt="" className="h-8 w-auto shrink-0 object-contain" />
            <span className="font-bold truncate text-sm sm:text-base">Voorraad Campagnefietsen</span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard/beheer?tab=campagnefietsen"
              className="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20 hover:bg-white/15"
            >
              Beheer
            </Link>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut()
                router.push('/login')
              }}
              className="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg bg-white/10 text-white border border-white/20"
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-6">
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
            Voorraad per winkel via dezelfde koppelingen als het voorraaddashboard (CycleSoftware, Wilmar, Vendit). Alleen winkels met voorraad &gt; 0 worden getoond.
          </p>
          <button
            type="button"
            onClick={() => mutate()}
            className="mt-4 text-sm font-semibold px-4 py-2 rounded-xl bg-white/15 border border-white/25 hover:bg-white/25 transition"
          >
            Vernieuwen
          </button>
        </div>
        )}

        {mayViewCampagneFietsen && isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-2xl bg-white border border-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {mayViewCampagneFietsen && error && (
          <div className="rounded-2xl p-4 bg-red-50 border border-red-100 text-red-800 text-sm">
            Kon voorraadgegevens niet laden. Probeer het opnieuw of neem contact op met een beheerder.
          </div>
        )}

        {mayViewCampagneFietsen && !isLoading && data && !data.error && fietsen.length === 0 && (
          <div className="rounded-2xl p-8 text-center bg-white border border-gray-100 text-gray-600">
            Geen actieve campagnefietsen. Voeg fietsen toe onder{' '}
            <Link href="/dashboard/beheer?tab=campagnefietsen" className="font-semibold text-dynamo-blue underline">
              Beheer → Campagnefietsen
            </Link>
            .
          </div>
        )}

        {mayViewCampagneFietsen && winkelFouten.length > 0 && (
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

        {mayViewCampagneFietsen && !isLoading &&
          fietsen.map(f => {
            const open = openId === f.id
            return (
              <article
                key={f.id}
                className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
                  <div className="shrink-0 w-full sm:w-44 aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                    {f.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.foto_url} alt="" className="w-full h-full object-contain" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">🚲</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{f.merk}</p>
                        <h2 className="text-lg font-bold leading-snug" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          {f.omschrijving_fiets}
                        </h2>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold tabular-nums" style={{ color: DYNAMO_BLUE }}>
                          {f.totaal_voorraad}
                        </p>
                        <p className="text-xs text-gray-500">stuks totaal</p>
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
                        <table className="w-full text-sm text-left">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="px-4 py-2 font-semibold text-gray-600">Winkel</th>
                              <th className="px-4 py-2 font-semibold text-gray-600">Plaats</th>
                              <th className="px-4 py-2 font-semibold text-gray-600">Bron</th>
                              <th className="px-4 py-2 font-semibold text-gray-600 text-right">Voorraad</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.winkels.map(w => (
                              <tr key={w.winkel_id} className="border-b border-gray-50 hover:bg-gray-50/80">
                                <td className="px-4 py-2 font-medium" style={{ color: DYNAMO_BLUE }}>
                                  {w.naam}
                                </td>
                                <td className="px-4 py-2 text-gray-600">{w.stad ?? '—'}</td>
                                <td className="px-4 py-2">
                                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                                    {w.bron}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right font-bold tabular-nums">{w.voorraad}</td>
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
      </main>
    </div>
  )
}
