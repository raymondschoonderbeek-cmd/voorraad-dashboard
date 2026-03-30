'use client'

import { useCallback, useEffect, useState } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'
import type { DrgNewsAfdeling } from '@/lib/news-afdelingen'

const F = "'Outfit', sans-serif"

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

type Props = {
  onUpdated?: () => void
}

const PANEL_ID = 'nieuws-afdelingen-beheer-panel'

export function NieuwsAfdelingenBeheer({ onUpdated }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<DrgNewsAfdeling[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [nieuwLabel, setNieuwLabel] = useState('')
  const [nieuwSlug, setNieuwSlug] = useState('')
  const [nieuwSort, setNieuwSort] = useState(0)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editSort, setEditSort] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/news/afdelingen')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Laden mislukt')
      setItems(Array.isArray(d.afdelingen) ? d.afdelingen : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt')
      setItems([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toevoegen(e: React.FormEvent) {
    e.preventDefault()
    if (!nieuwLabel.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/news/afdelingen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: nieuwLabel.trim(),
          slug: nieuwSlug.trim() || undefined,
          sort_order: nieuwSort,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Opslaan mislukt')
      setNieuwLabel('')
      setNieuwSlug('')
      setNieuwSort(0)
      await load()
      onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
    setSaving(false)
  }

  function startEdit(a: DrgNewsAfdeling) {
    setEditingId(a.id)
    setEditLabel(a.label)
    setEditSort(a.sort_order)
  }

  async function opslaanEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editLabel.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/news/afdelingen/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim(), sort_order: editSort }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? 'Opslaan mislukt')
      setEditingId(null)
      await load()
      onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    }
    setSaving(false)
  }

  async function verwijderen(id: string) {
    if (!confirm('Deze afdeling verwijderen? Alleen mogelijk als er geen berichten aan hangen.')) return
    setError('')
    const res = await fetch(`/api/news/afdelingen/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(typeof d?.error === 'string' ? d.error : 'Verwijderen mislukt')
      return
    }
    await load()
    onUpdated?.()
  }

  const inputStyle = { background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = 'w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: `1px solid rgba(45,69,124,0.1)` }}>
      <button
        type="button"
        id="nieuws-afdelingen-beheer-trigger"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-start gap-3 transition hover:bg-[rgba(45,69,124,0.03)]"
        style={{ fontFamily: F }}
      >
        <IconChevronDown
          className={`shrink-0 mt-0.5 text-[rgba(45,69,124,0.55)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
            Afdelingen
          </h2>
          <p className="text-xs m-0 mt-1" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
            {open
              ? 'Beheer welke afdelingen verschijnen bij nieuwsberichten. Technische sleutel (slug) is bij aanmaken instelbaar en daarna niet meer te wijzigen.'
              : !loading
                ? `${items.length} afdeling${items.length === 1 ? '' : 'en'} — klik om te beheren`
                : 'Laden…'}
          </p>
        </div>
      </button>

      <div
        id={PANEL_ID}
        role="region"
        aria-labelledby="nieuws-afdelingen-beheer-trigger"
        hidden={!open}
        className="px-5 pb-5 pt-4 space-y-4 border-t"
        style={{ borderColor: 'rgba(45,69,124,0.08)' }}
      >
      {error && (
        <div className="rounded-xl p-3 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>
          {error}
        </div>
      )}

      <form onSubmit={toevoegen} className="flex flex-col sm:flex-row flex-wrap gap-3 items-end border-b py-4" style={{ borderColor: 'rgba(45,69,124,0.08)' }}>
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
            Nieuwe afdeling (naam) *
          </label>
          <input
            className={inputClass}
            style={inputStyle}
            value={nieuwLabel}
            onChange={e => setNieuwLabel(e.target.value)}
            placeholder="bijv. Magazijn"
          />
        </div>
        <div className="w-full sm:w-40">
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
            Slug (optioneel)
          </label>
          <input
            className={inputClass}
            style={inputStyle}
            value={nieuwSlug}
            onChange={e => setNieuwSlug(e.target.value)}
            placeholder="auto van naam"
          />
        </div>
        <div className="w-full sm:w-28">
          <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
            Volgorde
          </label>
          <input
            type="number"
            className={inputClass}
            style={inputStyle}
            value={nieuwSort}
            onChange={e => setNieuwSort(Number(e.target.value))}
          />
        </div>
        <button
          type="submit"
          disabled={saving || !nieuwLabel.trim()}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: DYNAMO_BLUE, fontFamily: F }}
        >
          Toevoegen
        </button>
      </form>

      {loading ? (
        <p className="text-sm m-0" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
          Laden…
        </p>
      ) : (
        <ul className="space-y-2 list-none m-0 p-0">
          {items.map(a => (
            <li
              key={a.id}
              className="rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
              style={{ background: 'rgba(45,69,124,0.03)', border: '1px solid rgba(45,69,124,0.08)' }}
            >
              {editingId === a.id ? (
                <form onSubmit={opslaanEdit} className="flex flex-col sm:flex-row flex-wrap gap-2 items-end flex-1 w-full">
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
                      Naam
                    </label>
                    <input
                      className={inputClass}
                      style={inputStyle}
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] font-semibold uppercase block mb-0.5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
                      Volgorde
                    </label>
                    <input
                      type="number"
                      className={inputClass}
                      style={inputStyle}
                      value={editSort}
                      onChange={e => setEditSort(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                      style={{ background: DYNAMO_BLUE, fontFamily: F }}
                    >
                      Opslaan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}
                    >
                      Annuleren
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                      {a.label}
                    </span>
                    <span className="text-xs ml-2" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>
                      ({a.slug}) · volgorde {a.sort_order}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ background: 'rgba(45,69,124,0.06)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.12)', fontFamily: F }}
                    >
                      Bewerken
                    </button>
                    <button
                      type="button"
                      onClick={() => verwijderen(a.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                      style={{ color: '#dc2626', fontFamily: F }}
                    >
                      Verwijderen
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  )
}
