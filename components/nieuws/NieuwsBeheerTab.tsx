'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'
import type { DrgNewsPost } from '@/lib/news-types'
import type { DrgNewsAfdeling } from '@/lib/news-afdelingen'
import { NieuwsDigestSettings } from '@/components/nieuws/NieuwsDigestSettings'
import { NieuwsAfdelingenBeheer } from '@/components/nieuws/NieuwsAfdelingenBeheer'

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

  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  const [afdelingen, setAfdelingen] = useState<DrgNewsAfdeling[]>([])
  /** Lege string = alle afdelingen tonen */
  const [listFilterAfdeling, setListFilterAfdeling] = useState('')

  const loadAfdelingen = useCallback(async () => {
    try {
      const res = await fetch('/api/news/afdelingen')
      const d = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(d.afdelingen)) setAfdelingen(d.afdelingen)
    } catch {
      /* keep list */
    }
  }, [])

  useEffect(() => {
    void loadAfdelingen()
  }, [loadAfdelingen])

  const labelVoorSlug = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of afdelingen) m.set(a.slug, a.label)
    return (slug: string) => m.get(slug) ?? slug
  }, [afdelingen])

  const filteredPosts = useMemo(() => {
    if (!listFilterAfdeling.trim()) return posts
    return posts.filter(p => p.category === listFilterAfdeling)
  }, [posts, listFilterAfdeling])

  /** Opties voor filter: afdelingen uit API + slugs die nog op berichten staan maar niet in de lijst. */
  const afdelingFilterOptions = useMemo(() => {
    const rows: { slug: string; label: string }[] = afdelingen.map(a => ({ slug: a.slug, label: a.label }))
    const seen = new Set(rows.map(r => r.slug))
    for (const p of posts) {
      if (!seen.has(p.category)) {
        seen.add(p.category)
        rows.push({ slug: p.category, label: `${p.category}` })
      }
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, 'nl'))
    return rows
  }, [afdelingen, posts])

  function insertAtCursor(insert: string) {
    const el = bodyRef.current
    if (!el) {
      setBodyHtml(h => h + insert)
      return
    }
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    setBodyHtml(h => {
      const next = h.slice(0, start) + insert + h.slice(end)
      queueMicrotask(() => {
        el.focus()
        const pos = start + insert.length
        try {
          el.setSelectionRange(pos, pos)
        } catch {
          /* ignore */
        }
      })
      return next
    })
  }

  async function uploadImageFromFile(file: File) {
    setUploadErr('')
    setUploadBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/news/upload-image', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Upload mislukt')
      const url = String(data.url ?? '')
      if (!url) throw new Error('Geen URL ontvangen')
      const safeSrc = url.replace(/"/g, '&quot;')
      const snippet = `\n<p><img src="${safeSrc}" alt="" style="max-width:100%;height:auto;border-radius:8px" /></p>\n`
      insertAtCursor(snippet)
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : 'Upload mislukt')
    }
    setUploadBusy(false)
  }

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    void uploadImageFromFile(file)
  }

  /** Plakken van schermafdrukken / afbeeldingen uit o.a. Word, browser, Snipping Tool */
  function onBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const dt = e.clipboardData
    if (!dt) return

    let imageFile: File | null = null
    if (dt.files?.length) {
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i]
        if (f.type.startsWith('image/')) {
          imageFile = f
          break
        }
      }
    }
    if (!imageFile && dt.items?.length) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) {
            imageFile = f
            break
          }
        }
      }
    }

    if (imageFile) {
      e.preventDefault()
      e.stopPropagation()
      void uploadImageFromFile(imageFile)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/news?beheer=1')
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
    setCategory(afdelingen[0]?.slug ?? 'algemeen')
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
      await loadAfdelingen()
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
      <div className="flex flex-col sm:flex-row gap-3 sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold m-0" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
            Nieuwsberichten
          </h2>
          <p className="text-sm m-0 mt-1" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
            Hier beheer je berichten voor het team. Alleen gepubliceerde berichten zijn voor medewerkers zichtbaar.
          </p>
        </div>
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
                Afdeling
              </label>
              <select className={inputClass} style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                {afdelingen.length === 0 ? (
                  <option value={category}>{category}</option>
                ) : (
                  afdelingen.map(a => (
                    <option key={a.id} value={a.slug}>
                      {a.label}
                    </option>
                  ))
                )}
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
            <p className="text-[11px] m-0 mb-2" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
              Afbeeldingen: knop hieronder, of <strong>plakken</strong> in dit veld (Ctrl+V / ⌘V) vanuit schermafdrukken, browser, Word, enz. Ze worden
              geüpload en als <code className="text-[10px]">&lt;img&gt;</code> ingevoegd. Pas zo nodig de{' '}
              <code className="text-[10px]">alt</code>-tekst in de HTML aan.
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                tabIndex={-1}
                onChange={onImageFile}
              />
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => imageInputRef.current?.click()}
                aria-label="Afbeelding uploaden en in de inhoud invoegen"
                className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                style={{ border: '1px solid rgba(45,69,124,0.25)', color: DYNAMO_BLUE, fontFamily: F }}
              >
                {uploadBusy ? 'Uploaden…' : 'Afbeelding toevoegen'}
              </button>
              {uploadErr && (
                <span className="text-xs font-medium" style={{ color: '#dc2626', fontFamily: F }}>
                  {uploadErr}
                </span>
              )}
            </div>
            <textarea
              ref={bodyRef}
              className={`${inputClass} font-mono text-xs min-h-[200px]`}
              style={inputStyle}
              value={bodyHtml}
              onChange={e => setBodyHtml(e.target.value)}
              onPaste={onBodyPaste}
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
          <>
            <div
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-b"
              style={{ borderColor: 'rgba(45,69,124,0.08)', background: 'rgba(45,69,124,0.02)' }}
            >
              <label className="text-xs font-semibold shrink-0" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: F }}>
                Filter op afdeling
              </label>
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
                <select
                  className={`${inputClass} max-w-xs`}
                  style={inputStyle}
                  value={listFilterAfdeling}
                  onChange={e => setListFilterAfdeling(e.target.value)}
                  aria-label="Filter berichten op afdeling"
                >
                  <option value="">Alle afdelingen</option>
                  {afdelingFilterOptions.map(a => (
                    <option key={a.slug} value={a.slug}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                  {filteredPosts.length === posts.length
                    ? `${posts.length} bericht${posts.length === 1 ? '' : 'en'}`
                    : `${filteredPosts.length} van ${posts.length} bericht${posts.length === 1 ? '' : 'en'}`}
                </span>
              </div>
            </div>
            {filteredPosts.length === 0 ? (
              <p className="p-6 text-sm m-0" style={{ color: 'rgba(45,69,124,0.55)', fontFamily: F }}>
                Geen berichten voor deze afdeling. Kies een andere filter of plaats een bericht in deze afdeling.
              </p>
            ) : (
          <ul className="divide-y divide-[rgba(45,69,124,0.08)]">
            {filteredPosts.map(p => (
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
                      {labelVoorSlug(p.category)}
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
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="text-sm font-semibold"
                    style={{ color: DYNAMO_BLUE, fontFamily: F }}
                  >
                    Bewerken
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="text-sm font-semibold"
                    style={{ color: '#dc2626', fontFamily: F }}
                  >
                    Verwijderen
                  </button>
                </div>
              </li>
            ))}
          </ul>
            )}
          </>
        )}
      </div>

      <div className="space-y-4 pt-6 mt-2 border-t" style={{ borderColor: 'rgba(45,69,124,0.12)' }}>
        <p
          className="text-[11px] font-bold uppercase tracking-wider m-0"
          style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}
        >
          Instellingen — digest-mail & afdelingen
        </p>
        <NieuwsDigestSettings />
        <NieuwsAfdelingenBeheer onUpdated={loadAfdelingen} />
      </div>
    </div>
  )
}
