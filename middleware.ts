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

export async function middleware(request: NextRequest) {
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
  // icon / apple-icon: Next.js metadata-routes (favicon); niet door auth laten lopen
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)'],
}