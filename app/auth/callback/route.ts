import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/dashboard'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  const oauthErr = searchParams.get('error')
  if (oauthErr) {
    const desc = searchParams.get('error_description') ?? oauthErr
    return NextResponse.redirect(
      `${origin}/login?error=oauth&detail=${encodeURIComponent(desc)}`
    )
  }

  const code = searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }

    const msg = error.message ?? ''
    const isPkce =
      /pkce|code verifier/i.test(msg) ||
      msg.includes('different browser') ||
      msg.includes('storage was cleared')
    if (isPkce) {
      return NextResponse.redirect(
        `${origin}/login?error=auth&reason=pkce&magic=1&next=${encodeURIComponent(safeNext)}`
      )
    }
    const isExpired =
      /token has expired|expired or is invalid|invalid otp|otp has expired|email link is invalid|flow state has expired/i.test(
        msg
      )
    if (isExpired) {
      return NextResponse.redirect(
        `${origin}/login?error=auth&reason=expired&magic=1&next=${encodeURIComponent(safeNext)}`
      )
    }
    return NextResponse.redirect(
      `${origin}/login?error=auth&detail=${encodeURIComponent(msg)}`
    )
  }

  return NextResponse.redirect(`${origin}/login?error=auth&reason=no_code`)
}
