'use client'

import { useCallback, useEffect, useState } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'
import { DRG_NEWS_CATEGORIES, type DrgNewsPost } from '@/lib/news-types'

const F = "'Outfit', sans-serif"

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Waarde voor <input type="datetime-local" /> in lokale tijd van de browser */
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultScheduledLocal(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toDatetimeLocalValue(d.toISOString())
}

type PublishMode = 'draft' | 'now' | 'scheduled'

export function NieuwsBeheerTab() {
  const [posts, setPosts] = useState<DrgNewsPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<DrgNewsPost | null>(null)
  const [creating, setCreating] = useState(false)

  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [category, setCategory] = useState<string>('algemeen')
  const [isImportant, setIsImportant] = useState(false)
  const [publishMode, setPublishMode] = useState<PublishMode>('now')
  const [scheduledLocal, setScheduledLocal] = useState(defaultScheduledLocal)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/news')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? 'Laden mislukt')
      setPosts(Array.isArray(data.posts) ? data.posts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden mislukt')
      setPosts([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setCreating(true)
    setEditing(null)
    setTitle('')
    setExcerpt('')
    setBodyHtml('')
    setCategory('algemeen')
    setIsImportant(false)
    setPublishMode('now')
    setScheduledLocal(defaultScheduledLocal())
  }

  function openEdit(p: DrgNewsPost) {
    setEditing(p)
    setCreating(false)
    setTitle(p.title)
    setExcerpt(p.excerpt ?? '')
    setBodyHtml(p.body_html ?? '')
    setCategory(p.category)
    setIsImportant(p.is_important)
    if (!p.published_at) {
      setPublishMode('draft')
      setScheduledLocal(defaultScheduledLocal())
    } else {
      const t = new Date(p.published_at).getTime()
      const soon = Date.now() + 60_000
      if (t > soon) {
        setPublishMode('scheduled')
        setScheduledLocal(toDatetimeLocalValue(p.published_at))
      } else {
        setPublishMode('now')
        setScheduledLocal(toDatetimeLocalValue(p.published_at))
      }
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      let published_at: string | null = null
      if (publishMode === 'draft') {
        published_at = null
      } else if (publishMode === 'now') {
        if (editing?.published_at && new Date(editing.published_at).getTime() <= Date.now()) {
          published_at = editing.published_at
        } else {
          published_at = new Date().toISOString()
        }
      } else {
        const d = new Date(scheduledLocal)
        if (!scheduledLocal.trim() || Number.isNaN(d.getTime())) {
          setError('Kies een geldige datum en tijd voor inplannen.')
          setSaving(false)
          return
        }
        published_at = d.toISOString()
      }

      if (editing) {
        const patch: Record<string, unknown> = {
          title,
          excerpt: excerpt || null,
          body_html: bodyHtml,
          category,
          is_important: isImportant,
          published_at,
        }
        const res = await fetch(`/api/news/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? 'Opslaan mislukt')
      } else {
        const body: Record<string, unknown> = {
          title,
          excerpt: excerpt || null,
          body_html: bodyHtml,
          category,
          is_important: isImportant,
        }
        if (published_at) body.published_at = published_at
        const res = await fetch('/api/news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? 'Aanmaken mislukt')
      }
      setCreating(false)
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Dit bericht verwijderen?')) return
    setError('')
    const res = await fetch(`/api/news/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data?.error ?? 'Verwijderen mislukt')
      return
    }
    setEditing(null)
    await load()
  }

  const inputStyle = { background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = 'w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm m-0" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
          Beheer interne nieuwsberichten. Alleen gepubliceerde berichten zijn zichtbaar voor medewerkers.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 shrink-0"
          style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}
        >
          + Nieuw bericht
        </button>
      </div>

      {error && (
        <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>
          {error}
        </div>
      )}

      {(creating || editing) && (
        <form onSubmit={save} className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
          <h2 className="text-sm font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
            {editing ? 'Bericht bewerken' : 'Nieuw bericht'}
          </h2>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
              Titel *
            </label>
            <input className={inputClass} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
              Korte intro (optioneel)
            </label>
            <input className={inputClass} style={inputStyle} value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Zichtbaar in overzicht" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                Categorie
              </label>
              <select className={inputClass} style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                {DRG_NEWS_CATEGORIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                <input type="checkbox" checked={isImportant} onChange={e => setIsImportant(e.target.checked)} className="accent-[#2D457C]" />
                Belangrijk
              </label>
            </div>
          </div>
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.08)' }}>
            <span className="text-xs font-semibold block" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
              Publicatie
            </span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                <input
                  type="radio"
                  name="publishMode"
                  checked={publishMode === 'draft'}
                  onChange={() => setPublishMode('draft')}
                  className="accent-[#2D457C]"
                />
                Concept (niet zichtbaar voor medewerkers)
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                <input
                  type="radio"
                  name="publishMode"
                  checked={publishMode === 'now'}
                  onChange={() => setPublishMode('now')}
                  className="accent-[#2D457C]"
                />
                Nu publiceren
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                <input
                  type="radio"
                  name="publishMode"
                  checked={publishMode === 'scheduled'}
                  onChange={() => {
                    setPublishMode('scheduled')
                    if (!scheduledLocal) setScheduledLocal(defaultScheduledLocal())
                  }}
                  className="accent-[#2D457C]"
                />
                Inplannen op datum en tijd
              </label>
            </div>
            {publishMode === 'scheduled' && (
              <div className="pt-1">
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                  Live vanaf (jouw lokale tijd)
                </label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  style={inputStyle}
                  value={scheduledLocal}
                  onChange={e => setScheduledLocal(e.target.value)}
                  required={publishMode === 'scheduled'}
                />
                <p className="text-[11px] m-0 mt-1" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                  Zichtbaar voor iedereen zodra dit tijdstip is bereikt (Europe/Amsterdam wordt niet afgedwongen — gebruik de tijd die hier klopt voor jouw team).
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
              Inhoud (HTML toegestaan)
            </label>
            <textarea
              className={`${inputClass} font-mono text-xs min-h-[200px]`}
              style={inputStyle}
              value={bodyHtml}
              onChange={e => setBodyHtml(e.target.value)}
              placeholder="<p>...</p>"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
              {saving ? 'Bezig…' : 'Opslaan'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold"
              style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}
            >
              Annuleren
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => remove(editing.id)}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold ml-auto"
                style={{ color: '#dc2626', fontFamily: F }}
              >
                Verwijderen
              </button>
            )}
          </div>
        </form>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)' }}>
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
            Laden…
          </p>
        ) : posts.length === 0 ? (
          <p className="p-6 text-sm" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
            Nog geen berichten. Maak er een aan.
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(45,69,124,0.08)]">
            {posts.map(p => (
              <li key={p.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.is_important && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.12)', color: '#b91c1c' }}>
                        Belangrijk
                      </span>
                    )}
                    {!p.published_at && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.08)', color: 'rgba(45,69,124,0.6)' }}>
                        Concept
                      </span>
                    )}
                    {p.published_at && new Date(p.published_at).getTime() > Date.now() + 30_000 && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(234,88,12,0.12)', color: '#c2410c' }}>
                        Gepland
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'rgba(45,69,124,0.45)' }}>
                      {p.category}
                    </span>
                  </div>
                  <p className="font-semibold text-sm mt-1 m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                    {p.title}
                  </p>
                  {p.published_at && (
                    <p className="text-xs m-0 mt-0.5" style={{ color: 'rgba(45,69,124,0.45)' }}>
                      {new Date(p.published_at).getTime() > Date.now()
                        ? `Live vanaf: ${new Date(p.published_at).toLocaleString('nl-NL')}`
                        : `Live sinds: ${new Date(p.published_at).toLocaleString('nl-NL')}`}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="text-sm font-semibold shrink-0"
                  style={{ color: DYNAMO_BLUE, fontFamily: F }}
                >
                  Bewerken
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
