'use client'

import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import type { DrgNewsAfdeling } from '@/lib/news-afdelingen'
import type { DrgNewsPost } from '@/lib/news-types'

const fetcher = (url: string) => fetch(url).then(r => r.json())
const LIMIT = 20

export default function NieuwsOverzichtPage() {
  const [category, setCategory] = useState<string>('')
  const [importantOnly, setImportantOnly] = useState(false)
  const [q, setQ] = useState('')

  const [allPosts, setAllPosts] = useState<DrgNewsPost[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track active fetch to prevent race conditions when filters change rapidly
  const fetchIdRef = useRef(0)

  const { data: unreadData } = useSWR<{ count: number }>('/api/news/unread', fetcher)
  const { data: sessionInfo } = useSWR<{ canManageInterneNieuws?: boolean }>('/api/auth/session-info', fetcher)
  const { data: afdelingenData } = useSWR<{ afdelingen: DrgNewsAfdeling[] }>('/api/news/afdelingen', fetcher)

  const labelVoorSlug = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of afdelingenData?.afdelingen ?? []) m.set(a.slug, a.label)
    return (slug: string) => m.get(slug) ?? slug
  }, [afdelingenData?.afdelingen])

  const haalPostsOp = useCallback(async (fromOffset: number, cat: string, imp: boolean, search: string) => {
    const fetchId = ++fetchIdRef.current
    if (fromOffset === 0) { setIsLoading(true); setError(null) }
    else setLoadingMore(true)

    try {
      const params = new URLSearchParams()
      if (cat) params.set('category', cat)
      if (imp) params.set('important_only', '1')
      if (search.trim()) params.set('q', search.trim())
      params.set('limit', String(LIMIT))
      params.set('offset', String(fromOffset))

      const res = await fetch(`/api/news?${params}`)
      if (fetchId !== fetchIdRef.current) return // verouderd verzoek
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Laden mislukt')

      const nieuwePostsArray: DrgNewsPost[] = data.posts ?? []
      setAllPosts(prev => fromOffset === 0 ? nieuwePostsArray : [...prev, ...nieuwePostsArray])
      setTotal(data.total ?? 0)
      setHasMore(data.hasMore ?? false)
      setOffset(fromOffset + LIMIT)
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return
      setError(err instanceof Error ? err.message : 'Laden mislukt')
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  // Bij filterwijziging: reset en laad eerste pagina opnieuw
  useEffect(() => {
    setAllPosts([])
    setOffset(0)
    setHasMore(false)
    haalPostsOp(0, category, importantOnly, q)
  }, [category, importantOnly, q, haalPostsOp])

  const unread = unreadData?.count ?? 0

  return (
    <div style={{ minHeight: '100%', fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <div className="max-w-3xl mx-auto w-full space-y-5" style={{ padding: '24px 28px' }}>
        {sessionInfo?.canManageInterneNieuws && (
          <div className="flex justify-end">
            <Link
              href="/dashboard/nieuws/beheer"
              className="text-xs font-semibold hover:underline"
              style={{ color: DYNAMO_BLUE, fontFamily: FONT_FAMILY }}
            >
              Beheer nieuwsberichten →
            </Link>
          </div>
        )}
        <div>
          <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: DYNAMO_BLUE }}>
            Intern nieuws
          </h1>
          <p className="m-0 mt-1 text-sm" style={{ color: dashboardUi.textMuted }}>
            Mededelingen en updates voor het team.
          </p>
        </div>

        <div
          className="rounded-2xl p-4 flex flex-col sm:flex-row flex-wrap gap-3"
          style={{ background: dashboardUi.cardWhite.background, border: dashboardUi.cardWhite.border, boxShadow: dashboardUi.cardWhite.boxShadow }}
        >
          <div className="flex-1 min-w-[140px]">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Afdeling
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            >
              <option value="">Alle</option>
              {(afdelingenData?.afdelingen ?? []).map(a => (
                <option key={a.id} value={a.slug}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm pt-6 sm:pt-0" style={{ color: DYNAMO_BLUE }}>
            <input type="checkbox" checked={importantOnly} onChange={e => setImportantOnly(e.target.checked)} className="accent-[#2D457C]" />
            Alleen belangrijk
          </label>
          <div className="flex-1 min-w-[180px] sm:min-w-[220px]">
            <label className="text-[11px] font-semibold uppercase tracking-wide block mb-1" style={{ color: dashboardUi.textSubtle }}>
              Zoeken
            </label>
            <input
              type="search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Titel of intro…"
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            />
          </div>
        </div>

        {isLoading && (
          <div className="rounded-2xl p-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
            Laden…
          </div>
        )}

        {error && (
          <div className="rounded-2xl p-4 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>
            Kon nieuws niet laden. Probeer het opnieuw.
            <button type="button" className="ml-2 underline font-semibold" onClick={() => haalPostsOp(0, category, importantOnly, q)}>
              Opnieuw
            </button>
          </div>
        )}

        {!isLoading && !error && allPosts.length === 0 && (
          <div
            className="rounded-2xl p-10 text-center border border-dashed"
            style={{ borderColor: 'rgba(45,69,124,0.2)', color: dashboardUi.textMuted }}
          >
            Geen berichten gevonden. {category || importantOnly || q ? 'Pas de filters aan.' : 'Er is nog geen nieuws geplaatst.'}
          </div>
        )}

        <ul className="space-y-3 list-none m-0 p-0">
          {allPosts.map(p => (
            <li key={p.id}>
              <Link
                href={`/dashboard/nieuws/${p.id}`}
                className="block rounded-2xl p-4 sm:p-5 transition hover:shadow-lg"
                style={{
                  background: dashboardUi.cardWhite.background,
                  border: dashboardUi.cardWhite.border,
                  boxShadow: dashboardUi.cardWhite.boxShadow,
                }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {p.is_important && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.12)', color: '#b91c1c' }}>
                      Belangrijk
                    </span>
                  )}
                  <span className="text-xs" style={{ color: dashboardUi.textMuted }}>
                    {labelVoorSlug(p.category)}
                  </span>
                  {p.published_at && (
                    <time className="text-xs ml-auto" style={{ color: dashboardUi.textMuted }} dateTime={p.published_at}>
                      {new Date(p.published_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </time>
                  )}
                </div>
                <h2 className="m-0 text-base sm:text-lg font-bold" style={{ color: DYNAMO_BLUE }}>
                  {p.title}
                </h2>
                {p.excerpt && <p className="m-0 mt-2 text-sm line-clamp-2" style={{ color: dashboardUi.textMuted }}>{p.excerpt}</p>}
                <span className="inline-block mt-3 text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
                  Lees verder →
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {hasMore && (
          <div className="flex flex-col items-center gap-2 pt-2 pb-6">
            <button
              type="button"
              onClick={() => haalPostsOp(offset, category, importantOnly, q)}
              disabled={loadingMore}
              className="rounded-2xl px-6 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
              style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: FONT_FAMILY }}
            >
              {loadingMore ? 'Laden…' : `Toon meer (${allPosts.length} van ${total})`}
            </button>
          </div>
        )}

        {!isLoading && !hasMore && allPosts.length > 0 && (
          <p className="text-center text-xs pb-6" style={{ color: dashboardUi.textMuted }}>
            Alle {total} berichten geladen.
          </p>
        )}
      </div>
    </div>
  )
}
