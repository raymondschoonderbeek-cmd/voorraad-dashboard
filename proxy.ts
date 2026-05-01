import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

function applyHeaders(res: NextResponse) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    res.headers.set(key, value)
  })
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  applyHeaders(response)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Session refresh – belangrijk voor Vercel: cookies worden bijgewerkt in response
  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Auth session missing / expired – cookies worden mogelijk vernieuwd
  }

  const path = request.nextUrl.pathname

  // TV kiosk: ?access=<key> zet cookie en redirect naar /tv
  const tvKey = process.env.TV_API_KEY?.trim()
  const tvCookie = request.cookies.get('tv_access')?.value
  const isTvSession = tvKey && tvCookie === tvKey

  if (path.startsWith('/tv')) {
    const accessParam = request.nextUrl.searchParams.get('access')
    if (tvKey && accessParam === tvKey) {
      const res = NextResponse.redirect(new URL('/tv', request.url))
      applyHeaders(res)
      res.cookies.set('tv_access', tvKey, {
        httpOnly: true, secure: true, sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 365, path: '/',
      })
      return res
    }
    if (isTvSession) return response
  }

  // TV kiosk heeft ook toegang tot de data-API
  if (path === '/api/tv-data' && isTvSession) return response

  /** Cron/webhooks: geen browser-sessie; route valideert zelf (bijv. Authorization: Bearer CRON_SECRET). */
  const publicPaths = [
    '/login',
    '/update-password',
    '/auth/callback',
    '/api/auth/session-info',
    '/api/payments/tikkie/webhook',
    '/api/lunch/reminder-cron',
    '/api/campagne-fietsen/voorraad/sync',
    '/api/news/digest-cron',
    '/api/cron/',
    '/api/webhooks/',
    '/api/public/',
  ]
  const isPublic = publicPaths.some(p => path.startsWith(p))
  if (!user && !isPublic) {
    const redirect = NextResponse.redirect(new URL('/login', request.url))
    applyHeaders(redirect)
    // Cookie-handoff: gekopieerde cookies meenemen (bijv. na refresh)
    response.cookies.getAll().forEach(({ name, value }) => {
      redirect.cookies.set(name, value)
    })
    return redirect
  }

  return response
}

export const config = {
  // Statische assets en Next.js internals uitsluiten van auth-middleware
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icon|apple-icon|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf|eot)).*)'],
}
