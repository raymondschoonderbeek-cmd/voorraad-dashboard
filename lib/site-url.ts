import type { NextRequest } from 'next/server'

/** Publieke basis-URL voor magic-link redirects (geen trailing slash) */
export function getSiteUrl(): string {
  const u = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (u) return u.replace(/\/$/, '')
  const v = process.env.VERCEL_URL?.trim()
  if (v) return `https://${v.replace(/^https?:\/\//, '')}`
  return 'http://localhost:3000'
}

/**
 * Basis-URL voor Supabase `redirect_to` (magic link / inloggen als).
 * Gebruikt de browser-`origin` als die op de allowlist staat, anders getSiteUrl().
 * Zo werkt lokaal testen ook als NEXT_PUBLIC_SITE_URL naar productie wijst.
 */
export function resolveAppOriginForAuthRedirect(
  request: NextRequest,
  clientOrigin?: string | null
): string {
  const site = getSiteUrl().replace(/\/$/, '')
  const vercelRaw = process.env.VERCEL_URL?.trim()
  const vercel = vercelRaw ? `https://${vercelRaw.replace(/^https?:\/\//, '')}` : ''

  const allowed = new Set<string>([site, 'http://localhost:3000', 'http://127.0.0.1:3000'])
  if (vercel) allowed.add(vercel)

  const fromClient = clientOrigin?.trim().replace(/\/$/, '')
  if (fromClient && allowed.has(fromClient)) return fromClient

  const hdr = request.headers.get('origin')?.trim().replace(/\/$/, '')
  if (hdr && allowed.has(hdr)) return hdr

  return site
}
