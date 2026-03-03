import { NextResponse } from 'next/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

/** Rate limit check - return 429 response if over limit */
export function withRateLimit(request: Request): NextResponse | null {
  const ip = getClientIp(request)
  const { ok, remaining } = rateLimit(ip)
  if (!ok) {
    return NextResponse.json(
      { error: 'Te veel verzoeken. Probeer het later opnieuw.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  }
  return null
}
