'use client'
import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import type { Winkel } from '@/lib/types'
import { WinkelLijst } from './WinkelLijst'
import { WinkelDetail } from './WinkelDetail'
import { WinkelKaart } from '@/components/WinkelKaart'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const FAV_KEY = 'dynamo_crm_favs'
const TAB_KEY = 'dynamo_crm_active_tab'

type Tab = 'overzicht' | 'contact' | 'systemen' | 'financieel' | 'contracten' | 'activiteit' | 'support'
const DYNAMO_BLUE = '#2D457C'

function WinkelsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = searchParams.get('view')
  const idParam = searchParams.get('id')
  const tabParam = searchParams.get('tab') as Tab | null

  const { data: winkelsData = [], isLoading: winkelsLoading, mutate: mutateWinkels } = useSWR<Winkel[]>('/api/winkels', fetcher)
  const winkels = Array.isArray(winkelsData) ? winkelsData : []

  const { data: sessionData } = useSWR<{ isAdmin?: boolean; allowedCountries?: string[] | null }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const allowedCountries = sessionData?.allowedCountries ?? null

  const { data: favorietenData, mutate: mutateFavorieten } = useSWR<{ winkel_ids: number[] }>('/api/favorieten', fetcher)
  const serverFavorieten = Array.isArray(favorietenData?.winkel_ids) ? favorietenData.winkel_ids : []

  const [localFavs, setLocalFavs] = useState<number[]>([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { setLocalFavs(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]')) } catch {
      // ignore
    }
  }, [])

  const favorieten = useMemo(() => {
    const combined = new Set([...serverFavorieten, ...localFavs])
    return Array.from(combined)
  }, [serverFavorieten, localFavs])

  const winkelsVoorGebruiker = useMemo(() => {
    if (!allowedCountries || allowedCountries.length === 0) return winkels
    return winkels.filter(w => !w.land || allowedCountries.includes(w.land))
  }, [winkels, allowedCountries])

  const [geselecteerdeId, setGeselecteerdeId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overzicht')
  const [showDetail, setShowDetail] = useState(false) // mobile: false = toon lijst
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Sync URL → state on mount
  useEffect(() => {
    if (idParam) setGeselecteerdeId(Number(idParam))
    if (tabParam) setActiveTab(tabParam)
    else if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null
      if (saved) setActiveTab(saved)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selecteerWinkel(w: Winkel) {
    setGeselecteerdeId(w.id)
    setShowDetail(true)
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', String(w.id))
    params.delete('view')
    router.replace(`/dashboard/winkels?${params.toString()}`, { scroll: false })
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    localStorage.setItem(TAB_KEY, tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/dashboard/winkels?${params.toString()}`, { scroll: false })
  }

  async function toggleFavoriet(id: number) {
    // Optimistisch bijwerken in localStorage
    const next = localFavs.includes(id) ? localFavs.filter(f => f !== id) : [...localFavs, id]
    setLocalFavs(next)
    localStorage.setItem(FAV_KEY, JSON.stringify(next))
    // Ook server-side
    await fetch('/api/favorieten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ winkel_id: id }) })
    await mutateFavorieten()
  }

  // Kaart view (legacy)
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeResult, setGeocodeResult] = useState<{ bijgewerkt: number; totaal: number; mislukt: { id: number; naam: string }[]; zonderAdres: { id: number; naam: string }[] } | null>(null)

  const haalLocatiesOp = useCallback(async () => {
    setGeocodeLoading(true)
    try {
      const res = await fetch('/api/winkels/geocode', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { bijgewerkt?: number; totaal?: number; mislukt?: { id: number; naam: string }[]; zonderAdres?: { id: number; naam: string }[] }
      if (res.ok) { await mutateWinkels(); setGeocodeResult({ bijgewerkt: data.bijgewerkt ?? 0, totaal: data.totaal ?? 0, mislukt: data.mislukt ?? [], zonderAdres: data.zonderAdres ?? [] }) }
    } finally { setGeocodeLoading(false) }
  }, [mutateWinkels])

  const haalBelgieLocatiesOp = useCallback(async () => {
    setGeocodeLoading(true)
    try {
      const res = await fetch('/api/winkels/geocode?force_belgium=1', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { bijgewerkt?: number; totaal?: number; mislukt?: { id: number; naam: string }[]; zonderAdres?: { id: number; naam: string }[] }
      if (res.ok) { await mutateWinkels(); setGeocodeResult({ bijgewerkt: data.bijgewerkt ?? 0, totaal: data.totaal ?? 0, mislukt: data.mislukt ?? [], zonderAdres: data.zonderAdres ?? [] }) }
    } finally { setGeocodeLoading(false) }
  }, [mutateWinkels])

  if (view === 'kaart') {
    return (
      <div className="p-3 sm:p-5 max-w-[1400px] mx-auto w-full space-y-6">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => router.push('/dashboard/winkels')} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(45,69,124,0.15)', background:'white', color:DYNAMO_BLUE, fontSize:13, fontWeight:600, cursor:'pointer' }}>← Lijst</button>
          <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--drg-ink)' }}>Winkels op kaart</h1>
        </div>
        {winkelsLoading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:DYNAMO_BLUE }}>Laden…</div>
        ) : (
          <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid rgba(45,69,124,0.1)' }}>
            <WinkelKaart
              winkels={winkelsVoorGebruiker}
              onSelecteer={selecteerWinkel}
              onGeocode={haalLocatiesOp}
              onGeocodeBelgium={haalBelgieLocatiesOp}
              isAdmin={isAdmin}
              geocodeLoading={geocodeLoading}
              geocodeResult={geocodeResult}
              onDismissGeocodeResult={() => setGeocodeResult(null)}
            />
          </div>
        )}
      </div>
    )
  }

  // CRM split view — bepaal mobile state op basis van mounted + window.innerWidth
  const isMobile = mounted && typeof window !== 'undefined' && window.innerWidth < 768
  const verbergLijstOpMobile = isMobile && showDetail && !!geselecteerdeId

  return (
    <div style={{ display:'flex', height:'calc(100vh - 48px)', overflow:'hidden' }}>
      {/* Lijst paneel */}
      <div style={{
        width: 340,
        minWidth: 280,
        maxWidth: 400,
        borderRight: '1px solid var(--drg-line)',
        background: 'var(--drg-bg)',
        display: verbergLijstOpMobile ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {winkelsLoading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--drg-text-3)', fontSize:13 }}>Laden…</div>
        ) : (
          <WinkelLijst
            winkels={winkelsVoorGebruiker}
            geselecteerdeId={geselecteerdeId}
            onSelecteer={selecteerWinkel}
            favorieten={favorieten}
            onToggleFavoriet={toggleFavoriet}
            isAdmin={isAdmin}
          />
        )}
      </div>
      {/* Detail paneel */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        background: 'var(--drg-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {geselecteerdeId ? (
          <WinkelDetail
            winkelId={geselecteerdeId}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isAdmin={isAdmin}
            isFavoriet={favorieten.includes(geselecteerdeId)}
            onToggleFavoriet={toggleFavoriet}
            onTerug={() => { setShowDetail(false); setGeselecteerdeId(null) }}
            showTerugKnop={isMobile}
          />
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8 }}>
            <p style={{ color:'var(--drg-text-3)', fontSize:14 }}>Selecteer een winkel om de details te zien.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WinkelsPage() {
  return (
    <Suspense fallback={<div style={{ padding:40, textAlign:'center', color:'rgba(45,69,124,0.5)' }}>Laden…</div>}>
      <WinkelsPageInner />
    </Suspense>
  )
}
