'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'
import type { DrgNewsAfdeling } from '@/lib/news-afdelingen'
import type { DrgNewsPost } from '@/lib/news-types'
import { normalizeBodyHtml } from '@/lib/news-body'

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
  const { data: afdelingenData } = useSWR<{ afdelingen: DrgNewsAfdeling[] }>(
    '/api/news/afdelingen',
    (url: string) => fetch(url).then(r => r.json())
  )

  const afdelingLabel = useMemo(() => {
    const slug = data?.post?.category
    if (!slug) return ''
    const a = afdelingenData?.afdelingen?.find(x => x.slug === slug)
    return a?.label ?? slug
  }, [data?.post?.category, afdelingenData?.afdelingen])
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
    <div style={{ minHeight: '100%', fontFamily: FONT_FAMILY }}>

      <div className="max-w-3xl mx-auto w-full" style={{ padding: '24px 28px 40px' }}>
        {isLoading && (
          <div className="rounded-[10px] p-10 text-center text-sm" style={{ color: dashboardUi.textMuted }}>
            Laden…
          </div>
        )}

        {error && (
          <div className="rounded-[10px] p-4 text-sm" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c' }}>
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
            className="rounded-[10px] p-5 sm:p-8"
            style={{
              background: 'var(--drg-card-bg)',
              border: '1px solid var(--drg-card-border)',
              boxShadow: 'var(--drg-card-shadow)',
            }}
          >
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {post.is_important && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.12)', color: '#b91c1c' }}>
                  Belangrijk
                </span>
              )}
              <span className="text-xs" style={{ color: dashboardUi.textMuted }}>
                {afdelingLabel || post.category}
              </span>
              {post.published_at && (
                <time className="text-xs" style={{ color: dashboardUi.textMuted }} dateTime={post.published_at}>
                  {new Date(post.published_at).toLocaleString('nl-NL')}
                </time>
              )}
            </div>
            <h1 className="m-0 text-xl sm:text-2xl font-bold" style={{ color: 'var(--drg-ink)' }}>
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="m-0 mt-3 text-base leading-relaxed" style={{ color: dashboardUi.textMuted }}>
                {post.excerpt}
              </p>
            )}
            <div
              className="news-body-html mt-6"
              dangerouslySetInnerHTML={{ __html: normalizeBodyHtml(post.body_html) || '<p><em>Geen inhoud.</em></p>' }}
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
      </div>
    </div>
  )
}
