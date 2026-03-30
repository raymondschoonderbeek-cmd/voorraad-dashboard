'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import type { DrgNewsPost } from '@/lib/news-types'

async function fetcherNews(url: string) {
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Niet gevonden')
  return j
}

export default function NieuwsDetailPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const { mutate } = useSWRConfig()
  const { data, error, isLoading } = useSWR<{ post: DrgNewsPost }>(id ? `/api/news/${id}` : null, fetcherNews)
  const [markError, setMarkError] = useState('')
  const [markUnreadBusy, setMarkUnreadBusy] = useState(false)
  const [markUnreadOk, setMarkUnreadOk] = useState(false)

  const post = data?.post

  useEffect(() => {
    if (!id || !post?.id) return
    fetch('/api/news/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ news_id: id }),
    }).catch(() => setMarkError('Kon niet als gelezen markeren.'))
  }, [id, post?.id])

  async function markeerAlsOngelezen() {
    if (!id) return
    setMarkUnreadBusy(true)
    setMarkUnreadOk(false)
    setMarkError('')
    try {
      const res = await fetch(`/api/news/read?news_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Mislukt')
      await mutate('/api/news/unread')
      setMarkUnreadOk(true)
    } catch (e) {
      setMarkError(e instanceof Error ? e.message : 'Kon niet als ongelezen zetten.')
    }
    setMarkUnreadBusy(false)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: FONT_FAMILY }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-center gap-2 py-2 min-h-[56px]">
          <Link
            href="/dashboard/nieuws"
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90"
            style={{ fontFamily: FONT_FAMILY }}
          >
            ← Overzicht
          </Link>
          <Link href="/dashboard" className="text-xs text-white/80 hover:text-white ml-auto">
            Portal
          </Link>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5 max-w-3xl mx-auto w-full pb-10">
        {isLoading && (
          <div className="rounded-2xl p-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
            Laden…
          </div>
        )}

        {error && (
          <div className="rounded-2xl p-4 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>
            Bericht niet gevonden of geen toegang.
            <Link href="/dashboard/nieuws" className="block mt-2 font-semibold underline" style={{ color: DYNAMO_BLUE }}>
              Terug naar nieuws
            </Link>
          </div>
        )}

        {markError && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">{markError}</p>
        )}

        {post && (
          <article
            className="rounded-2xl p-5 sm:p-8"
            style={{
              background: dashboardUi.cardWhite.background,
              border: dashboardUi.cardWhite.border,
              boxShadow: dashboardUi.cardWhite.boxShadow,
            }}
          >
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {post.is_important && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.12)', color: '#b91c1c' }}>
                  Belangrijk
                </span>
              )}
              <span className="text-xs" style={{ color: dashboardUi.textMuted }}>
                {post.category}
              </span>
              {post.published_at && (
                <time className="text-xs" style={{ color: dashboardUi.textMuted }} dateTime={post.published_at}>
                  {new Date(post.published_at).toLocaleString('nl-NL')}
                </time>
              )}
            </div>
            <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: DYNAMO_BLUE }}>
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="m-0 mt-3 text-base leading-relaxed" style={{ color: dashboardUi.textMuted }}>
                {post.excerpt}
              </p>
            )}
            <div
              className="prose prose-slate max-w-none mt-6 text-[15px] leading-relaxed"
              style={{ color: `rgba(45,69,124,0.92)` }}
              dangerouslySetInnerHTML={{ __html: post.body_html || '<p><em>Geen inhoud.</em></p>' }}
            />
            <div className="mt-8 pt-6 border-t" style={{ borderColor: dashboardUi.sectionDivider }}>
              <p className="text-xs m-0 mb-2" style={{ color: dashboardUi.textMuted }}>
                Alleen voor jou: zet dit bericht terug op ongelezen (bijv. om later opnieuw te zien).
              </p>
              <button
                type="button"
                onClick={markeerAlsOngelezen}
                disabled={markUnreadBusy}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                style={{
                  background: 'rgba(45,69,124,0.06)',
                  color: DYNAMO_BLUE,
                  border: `1px solid ${dashboardUi.borderSoft}`,
                  fontFamily: FONT_FAMILY,
                }}
              >
                {markUnreadBusy ? 'Bezig…' : 'Markeer als ongelezen voor mij'}
              </button>
              {markUnreadOk && (
                <p className="text-xs m-0 mt-2" style={{ color: '#15803d', fontFamily: FONT_FAMILY }}>
                  Dit bericht telt weer mee als ongelezen op het overzicht en in de portal.
                </p>
              )}
            </div>
          </article>
        )}
      </main>
    </div>
  )
}
