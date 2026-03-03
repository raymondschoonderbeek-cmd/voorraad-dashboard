/** Simple in-memory rate limiting voor API routes */

const store = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60_000 // 1 minuut
const MAX_REQUESTS = 60 // max requests per window per IP

export function rateLimit(identifier: string): { ok: boolean; remaining: number } {
  const now = Date.now()
  let entry = store.get(identifier)

  if (!entry) {
    store.set(identifier, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true, remaining: MAX_REQUESTS - 1 }
  }

  if (now > entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS }
    store.set(identifier, entry)
    return { ok: true, remaining: MAX_REQUESTS - 1 }
  }

  entry.count++
  const remaining = Math.max(0, MAX_REQUESTS - entry.count)
  return { ok: entry.count <= MAX_REQUESTS, remaining }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}
