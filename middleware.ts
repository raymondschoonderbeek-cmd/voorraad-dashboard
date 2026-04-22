import { NextRequest, NextResponse } from 'next/server'

const TV_COOKIE = 'tv_access'
const TV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 jaar

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (pathname.startsWith('/tv')) {
    const tvKey = process.env.TV_API_KEY
    const accessParam = searchParams.get('access')
    const cookie = request.cookies.get(TV_COOKIE)?.value

    // Eerste bezoek met ?access=<key> → zet cookie en redirect naar /tv
    if (tvKey && accessParam === tvKey) {
      const res = NextResponse.redirect(new URL('/tv', request.url))
      res.cookies.set(TV_COOKIE, tvKey, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: TV_COOKIE_MAX_AGE,
        path: '/tv',
      })
      return res
    }

    // Geen geldige cookie → geen toegang
    if (!tvKey || cookie !== tvKey) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/tv/:path*'],
}
