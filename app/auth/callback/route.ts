import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Magic link / OAuth callback: wisselt `?code=` om voor een sessie.
 * Belangrijk: cookies moeten op het redirect-Response worden gezet (Next.js App Router),
 * niet alleen via `cookies()` uit next/headers — anders blijft de sessie leeg en eindig je op /login?error=auth.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') ?? '/dashboard'
  const origin = url.origin

  const oauthError = url.searchParams.get('error')
  const oauthErrorDesc = url.searchParams.get('error_description')
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError
    return NextResponse.redirect(`${origin}/login?error=auth&detail=${encodeURIComponent(msg)}`)
  }

  const safeNext =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'
  const redirectTarget = new URL(safeNext, origin).toString()

  if (code) {
    const response = NextResponse.redirect(redirectTarget)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return response
    }

    console.error('[auth/callback] exchangeCodeForSession', error.message)
    return NextResponse.redirect(
      `${origin}/login?error=auth&detail=${encodeURIComponent(error.message)}`
    )
  }

  return NextResponse.redirect(`${origin}/login?error=auth&reason=no_code`)
}
