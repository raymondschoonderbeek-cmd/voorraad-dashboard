'use client'

import { useMemo, useState } from 'react'
import type { Winkel } from '@/lib/types'
import { DYNAMO_BLUE } from '@/lib/theme'

type Props = {
  winkels: Winkel[]
  onSelect: (w: Winkel) => void
}

export function WinkelZoekBlok({ winkels, onSelect }: Props) {
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

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}
    >
      <div className="p-4 border-b" style={{ borderColor: 'rgba(13,31,78,0.08)' }}>
        <h2 className="font-bold text-base mb-3" style={{ color: DYNAMO_BLUE }}>Kies een winkel</h2>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(13,31,78,0.3)' }}>⌕</span>
          <input
            type="search"
            placeholder="Zoek op naam, dealer of stad..."
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 pl-9 text-sm bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
        </div>
      </div>
      <div className="overflow-y-auto max-h-[320px]">
        {gefilterd.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            {zoek ? 'Geen winkels gevonden' : 'Geen winkels beschikbaar'}
          </div>
        ) : (
          <ul className="divide-y divide-[rgba(13,31,78,0.06)]">
            {gefilterd.map(w => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onSelect(w)}
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
    </div>
  )
}
