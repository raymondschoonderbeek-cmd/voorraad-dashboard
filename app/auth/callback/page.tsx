'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Magic-link / OAuth callback.
 * Supabase kan óf `?code=` (PKCE) óf `#access_token=&refresh_token=` (implicit) teruggeven.
 * De hash ziet de server nooit — daarom moet dit op de client.
 */
function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Inloggen…')

  useEffect(() => {
    const supabase = createClient()
    const nextRaw = searchParams.get('next') ?? '/dashboard'
    const safeNext = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard'

    const oauthErr = searchParams.get('error')
    const oauthErrDesc = searchParams.get('error_description')
    if (oauthErr) {
      router.replace(`/login?error=oauth&detail=${encodeURIComponent(oauthErrDesc || oauthErr)}`)
      return
    }

    let cancelled = false

    async function run() {
      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (error) {
          setStatus('Mislukt')
          const msg = error.message ?? ''
          const isPkce =
            /pkce|code verifier/i.test(msg) ||
            msg.includes('different browser') ||
            msg.includes('storage was cleared')
          if (isPkce) {
            router.replace(
              `/login?error=auth&reason=pkce&magic=1&next=${encodeURIComponent(safeNext)}`
            )
            return
          }
          const isTokenExpired =
            /token has expired|expired or is invalid|invalid otp|otp has expired|email link is invalid|flow state has expired/i.test(
              msg
            )
          if (isTokenExpired) {
            router.replace(
              `/login?error=auth&reason=expired&magic=1&next=${encodeURIComponent(safeNext)}`
            )
            return
          }
          router.replace(`/login?error=auth&detail=${encodeURIComponent(error.message)}`)
          return
        }
        router.replace(safeNext)
        return
      }

      const h = typeof window !== 'undefined' ? window.location.hash : ''
      if (h.length > 1) {
        const params = new URLSearchParams(h.substring(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
          }
          if (cancelled) return
          if (error) {
            setStatus('Mislukt')
            const msg = error.message ?? ''
            const isTokenExpired =
              /token has expired|expired or is invalid|invalid otp|otp has expired|email link is invalid|flow state has expired/i.test(
                msg
              )
            if (isTokenExpired) {
              router.replace(
                `/login?error=auth&reason=expired&magic=1&next=${encodeURIComponent(safeNext)}`
              )
            } else {
              router.replace(`/login?error=auth&detail=${encodeURIComponent(error.message)}`)
            }
            return
          }
          router.replace(safeNext)
          return
        }
      }

      if (cancelled) return
      router.replace('/login?error=auth&reason=no_code')
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] px-4">
      <p className="text-sm" style={{ color: 'rgba(45,69,124,0.65)', fontFamily: "'Outfit', sans-serif" }}>
        {status}
      </p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb] text-sm text-slate-600">
          Laden…
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  )
}
