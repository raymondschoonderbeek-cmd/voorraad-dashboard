'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import { DRG_NEWS_CATEGORIES, type DrgNewsPost } from '@/lib/news-types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function NieuwsOverzichtPage() {
  const [category, setCategory] = useState<string>('')
  const [importantOnly, setImportantOnly] = useState(false)
  const [q, setQ] = useState('')

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (category) p.set('category', category)
    if (importantOnly) p.set('important_only', '1')
    if (q.trim()) p.set('q', q.trim())
    const s = p.toString()
    return s ? `/api/news?${s}` : '/api/news'
  }, [category, importantOnly, q])

  const { data, error, isLoading, mutate: refetchNews } = useSWR<{ posts: DrgNewsPost[] }>(query, fetcher)
  const { data: unreadData } = useSWR<{ count: number }>('/api/news/unread', fetcher)
  const { data: sessionInfo } = useSWR<{ canManageInterneNieuws?: boolean }>('/api/auth/session-info', fetcher)

  const posts = data?.posts ?? []
  const unread = unreadData?.count ?? 0

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-center gap-2 py-2 min-h-[56px]">
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90"
            style={{ fontFamily: FONT_FAMILY }}
          >
            ← Portal
          </Link>
          <span className="text-white text-sm font-semibold" style={{ fontFamily: FONT_FAMILY }}>
            Nieuws
          </span>
          {unread > 0 && (
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(240,192,64,0.95)', color: DYNAMO_BLUE }}
            >
              {unread} ongelezen
            </span>
          )}
          {sessionInfo?.canManageInterneNieuws && (
            <Link
              href="/dashboard/nieuws/beheer"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-white/25 text-white hover:bg-white/10 ml-auto sm:ml-0"
              style={{ fontFamily: FONT_FAMILY }}
            >
              Beheer nieuwsberichten
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5 max-w-3xl mx-auto w-full space-y-5">
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
              Categorie
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm border"
              style={{ borderColor: dashboardUi.borderSoft, color: DYNAMO_BLUE }}
            >
              <option value="">Alle</option>
              {DRG_NEWS_CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {c}
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
            <button type="button" className="ml-2 underline font-semibold" onClick={() => refetchNews()}>
              Opnieuw
            </button>
          </div>
        )}

        {!isLoading && !error && posts.length === 0 && (
          <div
            className="rounded-2xl p-10 text-center border border-dashed"
            style={{ borderColor: 'rgba(45,69,124,0.2)', color: dashboardUi.textMuted }}
          >
            Geen berichten gevonden. {category || importantOnly || q ? 'Pas de filters aan.' : 'Er is nog geen nieuws geplaatst.'}
          </div>
        )}

        <ul className="space-y-3 list-none m-0 p-0">
          {posts.map(p => (
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
                    {p.category}
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
      </main>
    </div>
  )
}
