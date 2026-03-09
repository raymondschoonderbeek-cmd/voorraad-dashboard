'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE } from '@/lib/theme'
import { VENDIT_GET_ENDPOINTS } from '@/lib/vendit-api-endpoints'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const F = "'Outfit', sans-serif"

export default function VenditApiTesterPage() {
  const { data: sessionData } = useSWR<{ isAdmin?: boolean }>('/api/auth/session-info', fetcher)
  const isAdmin = sessionData?.isAdmin === true
  const { data: gebruikersData } = useSWR(isAdmin ? '/api/gebruikers' : null, fetcher)
  const winkels = (gebruikersData?.winkels ?? []) as { id: number; naam: string; api_type?: string; dealer_nummer?: string }[]
  const venditWinkels = winkels.filter(w => w.api_type === 'vendit')

  const [selectedWinkelId, setSelectedWinkelId] = useState<number | ''>('')
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ status?: number; statusText?: string; url?: string; data?: unknown; error?: string } | null>(null)

  const endpoint = VENDIT_GET_ENDPOINTS.find(e => e.path === selectedEndpoint)
  const hasParams = endpoint?.params?.length ?? 0 > 0

  useEffect(() => {
    if (endpoint?.params) {
      setParams(prev => {
        const next = { ...prev }
        for (const p of endpoint.params) {
          if (!(p.name in next)) next[p.name] = ''
        }
        return next
      })
    } else {
      setParams({})
    }
  }, [selectedEndpoint, endpoint?.params])

  async function runTest() {
    if (!selectedWinkelId || !selectedEndpoint) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/vendit-api-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winkel_id: selectedWinkelId,
          path: selectedEndpoint,
          params: endpoint?.params?.length ? params : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ error: data.error ?? data.message ?? `HTTP ${res.status}` })
      } else {
        setResult(data)
      }
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Netwerkfout' })
    }
    setLoading(false)
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#f4f6fb', fontFamily: F }}>
        <p className="text-sm font-medium" style={{ color: 'rgba(13,31,78,0.6)' }}>Alleen admins hebben toegang tot de Vendit API Tester.</p>
        <Link href="/dashboard" className="mt-4 text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>← Terug naar Dashboard</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#f4f6fb', fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-50">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 text-white font-bold hover:opacity-90">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#f0c040', color: DYNAMO_BLUE }}>D</span>
            Vendit API Tester
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/beheer" className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)' }}>
              Beheer
            </Link>
            <Link href="/dashboard" className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>← Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="rounded-2xl p-4 sm:p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
          <h1 className="text-lg font-bold mb-4" style={{ color: DYNAMO_BLUE }}>Vendit Public API testen</h1>
          <p className="text-sm mb-6" style={{ color: 'rgba(13,31,78,0.5)' }}>
            Selecteer een Vendit-winkel met geconfigureerde API-credentials en een GET-endpoint. Vul eventuele parameters in en voer de call uit.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(13,31,78,0.6)' }}>Winkel</label>
              <select
                value={selectedWinkelId}
                onChange={e => setSelectedWinkelId(e.target.value ? Number(e.target.value) : '')}
                className="w-full rounded-xl px-3 py-2.5 text-sm border"
                style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)', color: DYNAMO_BLUE }}
              >
                <option value="">— Selecteer winkel —</option>
                {venditWinkels.map(w => (
                  <option key={w.id} value={w.id}>{w.naam} (#{w.dealer_nummer})</option>
                ))}
                {venditWinkels.length === 0 && (
                  <option value="" disabled>Geen Vendit-winkels. Voeg API-credentials toe in Beheer.</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(13,31,78,0.6)' }}>GET Endpoint</label>
              <select
                value={selectedEndpoint}
                onChange={e => setSelectedEndpoint(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm border"
                style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)', color: DYNAMO_BLUE }}
              >
                <option value="">— Selecteer endpoint —</option>
                {VENDIT_GET_ENDPOINTS.map(ep => (
                  <option key={ep.path} value={ep.path}>{ep.label}</option>
                ))}
              </select>
            </div>

            {hasParams && endpoint?.params && (
              <div className="space-y-3">
                <label className="block text-xs font-semibold" style={{ color: 'rgba(13,31,78,0.6)' }}>Parameters</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {endpoint.params.map(p => (
                    <div key={p.name}>
                      <label className="block text-xs mb-1" style={{ color: 'rgba(13,31,78,0.45)' }}>{p.name}</label>
                      <input
                        type="text"
                        placeholder={p.placeholder}
                        value={params[p.name] ?? ''}
                        onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                        className="w-full rounded-lg px-3 py-2 text-sm border"
                        style={{ background: 'rgba(13,31,78,0.02)', borderColor: 'rgba(13,31,78,0.12)' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={runTest}
              disabled={loading || !selectedWinkelId || !selectedEndpoint}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
              style={{ background: DYNAMO_BLUE, color: 'white' }}
            >
              {loading ? 'Bezig...' : 'Uitvoeren'}
            </button>
          </div>
        </div>

        {result && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.08)', boxShadow: '0 2px 12px rgba(13,31,78,0.04)' }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'rgba(13,31,78,0.04)', borderBottom: '1px solid rgba(13,31,78,0.08)' }}>
              <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>Resultaat</span>
              {result.status != null && (
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${result.status >= 200 && result.status < 300 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {result.status} {result.statusText ?? ''}
                </span>
              )}
            </div>
            <div className="p-4 overflow-x-auto">
              {result.error ? (
                <p className="text-sm" style={{ color: '#dc2626' }}>{result.error}</p>
              ) : (
                <>
                  {result.url && (
                    <p className="text-xs font-mono mb-3 truncate" style={{ color: 'rgba(13,31,78,0.5)' }} title={result.url}>{result.url}</p>
                  )}
                  <pre className="text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto p-3 rounded-lg" style={{ background: 'rgba(13,31,78,0.03)', color: 'rgba(13,31,78,0.85)' }}>
                    {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
