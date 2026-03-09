'use client'

import { useMemo, useState } from 'react'
import type { Winkel } from '@/lib/types'
import { DYNAMO_BLUE } from '@/lib/theme'

type Props = {
  open: boolean
  onClose: () => void
  winkels: Winkel[]
  onSelect: (w: Winkel) => void
  loading?: boolean
}

export function WinkelModal({ open, onClose, winkels, onSelect, loading = false }: Props) {
  const [zoek, setZoek] = useState('')

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return winkels
    return winkels.filter(w =>
      w.naam.toLowerCase().includes(q) ||
      w.dealer_nummer.includes(q) ||
      (w.stad?.toLowerCase().includes(q))
    )
  }, [winkels, zoek])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Kies een winkel"
    >
      <div style={{ background: 'rgba(13,31,78,0.6)' }} className="absolute inset-0 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'white', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
          <h2 className="font-bold text-lg" style={{ color: DYNAMO_BLUE }}>Kies een winkel</h2>
          <input
            type="search"
            placeholder="Zoek op naam, dealer of stad..."
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            autoFocus
            className="w-full mt-3 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>
        <div className="overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="p-6 flex items-center justify-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
              <span className="text-sm font-medium" style={{ color: DYNAMO_BLUE }}>Winkels laden...</span>
            </div>
          ) : gefilterd.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              {zoek ? 'Geen winkels gevonden' : 'Geen winkels beschikbaar'}
            </div>
          ) : (
            <ul className="divide-y divide-[rgba(13,31,78,0.06)]">
              {gefilterd.map(w => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(w); onClose() }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition flex items-center justify-between gap-3"
                  >
                    <span className="font-semibold" style={{ color: DYNAMO_BLUE }}>{w.naam}</span>
                    {w.stad && <span className="text-xs text-gray-500">{w.stad}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-3 border-t flex justify-end" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: DYNAMO_BLUE }}
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  )
}
