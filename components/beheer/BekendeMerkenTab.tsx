'use client'

import { useState, useEffect, useCallback } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'

const F = "'Outfit', sans-serif"
const inputStyle = { background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
const inputClass = 'w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400'

export function BekendeMerkenTab() {
  const [bekendeMerken, setBekendeMerken] = useState<{ id: number; label: string; created_at: string }[]>([])
  const [nieuwMerk, setNieuwMerk] = useState('')
  const [merkLoading, setMerkLoading] = useState(false)
  const [merkError, setMerkError] = useState('')

  const haalMerkenOp = useCallback(async () => {
    const res = await fetch('/api/bekende-merken')
    if (res.ok) {
      const data = await res.json()
      setBekendeMerken(Array.isArray(data) ? data : [])
    } else {
      setBekendeMerken([])
    }
  }, [])

  useEffect(() => { haalMerkenOp() }, [haalMerkenOp])

  async function voegMerkToe(e: React.FormEvent) {
    e.preventDefault()
    const label = nieuwMerk.trim()
    if (!label) return
    setMerkLoading(true)
    setMerkError('')
    try {
      const res = await fetch('/api/bekende-merken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Fout: ${res.status}`)
      setNieuwMerk('')
      haalMerkenOp()
    } catch (err: unknown) {
      setMerkError(err instanceof Error ? err.message : 'Toevoegen mislukt')
    }
    setMerkLoading(false)
  }

  async function verwijderMerk(id: number) {
    if (!confirm('Dit merk verwijderen?')) return
    const res = await fetch(`/api/bekende-merken?id=${id}`, { method: 'DELETE' })
    if (res.ok) haalMerkenOp()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid rgba(45,69,124,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
          <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Bekende merken</div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Lijst voor Vendit merk-extractie uit productomschrijving. Merken worden herkend aan het begin van de omschrijving (bijv. &quot;Batavus Grenoble&quot;).</div>
        </div>
        <div className="p-4 space-y-4">
          <form onSubmit={voegMerkToe} className="flex gap-2">
            <input
              value={nieuwMerk}
              onChange={e => setNieuwMerk(e.target.value)}
              placeholder="Bijv. Batavus, Gazelle, Trek"
              className={inputClass}
              style={inputStyle}
            />
            <button type="submit" disabled={merkLoading || !nieuwMerk.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
              {merkLoading ? 'Bezig...' : 'Toevoegen'}
            </button>
          </form>
          {merkError && <div className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{merkError}</div>}
          <div className="divide-y" style={{ borderColor: 'rgba(45,69,124,0.06)' }}>
            {bekendeMerken.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Nog geen merken. Voeg merken toe voor Vendit merk-extractie.</div>
            ) : (
              bekendeMerken.map(m => (
                <div key={m.id} className="flex items-center justify-between py-3">
                  <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{m.label}</span>
                  <button onClick={() => verwijderMerk(m.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
