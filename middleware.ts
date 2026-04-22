import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const TV_COOKIE = 'tv_access'
const TV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 jaar

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (pathname.startsWith('/tv')) {
    const tvKey = process.env.TV_API_KEY
    const accessParam = searchParams.get('access')
    const tvCookie = request.cookies.get(TV_COOKIE)?.value

    // Eerste bezoek met ?access=<key> → zet cookie en redirect naar /tv
    if (tvKey && accessParam === tvKey) {
      const res = NextResponse.redirect(new URL('/tv', request.url))
      res.cookies.set(TV_COOKIE, tvKey, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: TV_COOKIE_MAX_AGE,
        path: '/',
      })
      return res
    }

    // TV-cookie geldig → door
    if (tvKey && tvCookie === tvKey) return NextResponse.next()

    // Supabase-sessie geldig → door
    const response = NextResponse.next()
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
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return response

    // Geen toegang
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/tv', '/tv/:path*'],
}
