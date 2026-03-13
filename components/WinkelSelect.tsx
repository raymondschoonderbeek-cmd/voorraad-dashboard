'use client'

import { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react'
import type { Winkel } from '@/lib/types'
import { DYNAMO_BLUE } from '@/lib/theme'

export type WinkelSelectRef = { open: () => void; focus: () => void }

type Props = {
  winkels: Winkel[]
  value: Winkel | null
  onChange: (w: Winkel) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  id?: string
  'aria-label'?: string
}

export const WinkelSelect = forwardRef<WinkelSelectRef, Props>(function WinkelSelect(
  { winkels, value, onChange, placeholder = 'Kies winkel...', className = '', style = {}, id, 'aria-label': ariaLabel },
  ref
) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    focus: () => buttonRef.current?.focus(),
  }), [])
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return winkels
    return winkels.filter(w =>
      w.naam.toLowerCase().includes(q) ||
      w.dealer_nummer.includes(q) ||
      (w.stad?.toLowerCase().includes(q))
    )
  }, [winkels, search])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-label={ariaLabel ?? 'Selecteer winkel'}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(v => !v)}
        className="w-full text-left text-sm rounded-lg px-3 py-1.5 cursor-pointer min-w-0 max-w-[180px] sm:min-w-[140px] flex items-center justify-between gap-2"
        style={{ background: 'rgba(255,255,255,0.07)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', ...style }}
      >
        <span className="truncate">{value?.naam ?? placeholder}</span>
        <span className="shrink-0" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Winkellijst"
          className="absolute top-full left-0 mt-1 z-[200] min-w-[280px] max-w-[360px] max-h-[320px] overflow-hidden rounded-xl shadow-2xl"
          style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)', boxShadow: '0 12px 40px rgba(45,69,124,0.2)' }}
        >
          <div className="p-2 border-b border-gray-100">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek winkel..."
              className="w-full rounded-lg px-3 py-2 text-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-dynamo-blue/30 bg-white text-gray-900 placeholder:text-gray-400"
              aria-label="Zoek winkel"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-[220px]">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">Geen winkels gevonden</div>
            ) : (
              filtered.map(w => (
                <button
                  key={w.id}
                  role="option"
                  aria-selected={value?.id === w.id}
                  onClick={() => { onChange(w); setOpen(false); setSearch('') }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition"
                  style={{ background: value?.id === w.id ? 'rgba(45,69,124,0.06)' : undefined, color: DYNAMO_BLUE }}
                >
                  <div className="font-medium truncate">{w.naam}</div>
                  <div className="text-xs text-gray-500">#{w.dealer_nummer}{w.stad ? ` · ${w.stad}` : ''}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
})
