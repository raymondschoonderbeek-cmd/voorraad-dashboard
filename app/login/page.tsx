'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

/** Supabase Auth: te veel OTP/magic-link-mails; geen app-rate-limit. */
function formatSupabaseEmailRateError(raw: string): string {
  const t = raw.toLowerCase()
  if (t.includes('rate limit') && (t.includes('email') || t.includes('otp') || t.includes('mail'))) {
    return (
      'Te veel inlogmails in korte tijd (limiet van Supabase). Wacht een paar minuten en vraag daarna opnieuw een link aan, ' +
      'of gebruik inloggen met wachtwoord. Beheer: Supabase-dashboard → Authentication → Rate limits (en bij ingebouwde e-mail: uurlijks plafond per project).'
    )
  }
  return raw
}

const PKCE_HINT =
  'De inloglink werkt alleen in dezelfde browser als waar je de mail aanvroeg (PKCE). ' +
  'Open de link in die browser, of vul hieronder de 6-cijferige code uit de e-mail in bij “Inloggen met code”.'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [magicLinkMode, setMagicLinkMode] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  /** Tokens in de hash (implicit flow) — o.a. als een oude server-callback de hash kwijtraakte en je op /login landt. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const h = window.location.hash
    if (!h || h.length <= 1) return
    const params = new URLSearchParams(h.substring(1))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (!access_token || !refresh_token) return

    const client = createClient()
    let cancelled = false
    void (async () => {
      const { error } = await client.auth.setSession({ access_token, refresh_token })
      if (cancelled) return
      window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''))
      if (error) {
        setError(error.message)
        return
      }
      const nextParam = searchParams.get('next')?.trim()
      const nextPath =
        nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'
      router.replace(nextPath)
    })()
    return () => {
      cancelled = true
    }
  }, [router, searchParams])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash?.includes('access_token')) {
      return
    }
    const err = searchParams.get('error')
    const detail = searchParams.get('detail')
    const reason = searchParams.get('reason')
    if (err === 'auth') {
      if (reason === 'pkce') {
        setMagicLinkMode(true)
        setError(PKCE_HINT)
      } else if (detail) {
        const d = detail.toLowerCase()
        if (d.includes('pkce') || d.includes('code verifier') || d.includes('different browser')) {
          setMagicLinkMode(true)
          setError(PKCE_HINT)
        } else {
          setError(`Inloggen mislukt: ${detail}`)
        }
      } else if (reason === 'no_code') {
        setError(
          'De inloglink kon niet worden voltooid (geen autorisatiecode). Controleer of de link nog geldig is, of log opnieuw in via Beheer → Inloggen als.'
        )
      } else {
        setError('Inloggen mislukt. Probeer opnieuw of gebruik je wachtwoord.')
      }
    }
  }, [searchParams])

  useEffect(() => {
    const magic = searchParams.get('magic')
    if (magic === '1' || magic === 'true' || magic === 'yes') {
      setMagicLinkMode(true)
    }
    const preEmail = searchParams.get('email')?.trim()
    if (preEmail) setEmail(preEmail)
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (magicLinkMode) {
      const nextParam = searchParams.get('next')?.trim()
      const nextPath =
        nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
          ? nextParam
          : '/dashboard'
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: callbackUrl,
        },
      })
      if (otpError) {
        setError(formatSupabaseEmailRateError(otpError.message))
      } else {
        setMessage(
          'Check je e-mail voor de inloglink. Werkt de link niet (andere app of telefoon)? Vul dan de 6-cijferige code hieronder in.'
        )
      }
      setLoading(false)
      return
    }

    const { error: pwdError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (pwdError) {
      setError(pwdError.message)
      setLoading(false)
    } else {
      const nextParam = searchParams.get('next')?.trim()
      const nextPath =
        nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'
      router.push(nextPath)
    }
  }

  async function handleResetPassword() {
    if (!email) {
      setError('Vul eerst je e-mailadres in.')
      return
    }

    setError('')
    setMessage('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    if (error) {
      setError(formatSupabaseEmailRateError(error.message))
    } else {
      setMessage('Reset e-mail verstuurd. Controleer je inbox.')
    }

    setLoading(false)
  }

  async function handleVerifyOtp() {
    const em = email.trim()
    const digits = otpCode.replace(/\D/g, '')
    if (!em) {
      setError('Vul je e-mailadres in.')
      return
    }
    if (digits.length < 6) {
      setError('Vul de code uit de e-mail in (meestal 6 cijfers).')
      return
    }

    setError('')
    setMessage('')
    setLoading(true)

    const { error: vErr } = await supabase.auth.verifyOtp({
      email: em,
      token: digits,
      type: 'email',
    })

    setLoading(false)

    if (vErr) {
      setError(vErr.message)
      return
    }

    const nextParam = searchParams.get('next')?.trim()
    const nextPath =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/dashboard'
    router.push(nextPath)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dynamo-page px-4 py-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-[0_8px_40px_rgba(45,69,124,0.08)] border border-dynamo-blue-light/40 space-y-5"
      >
        <div>
          <h1 className="text-3xl font-bold text-dynamo-blue tracking-tight">Inloggen</h1>
          <p className="text-sm text-dynamo-blue-light mt-1">
            Log in op DRG Portal.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg p-3">
            {message}
          </div>
        )}

        <div className="space-y-4">
          <input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full rounded-xl px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-dynamo-blue-light/35 focus:border-dynamo-blue focus:outline-none focus:ring-2 focus:ring-dynamo-blue/25"
          />

          {magicLinkMode && (
            <div className="space-y-3 pt-1 border-t border-dynamo-blue-light/25">
              <p className="text-xs text-dynamo-blue-light leading-relaxed">
                Andere browser of mail-app? Voer de code uit dezelfde e-mail in (geen nieuwe mail nodig).
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-cijferige code uit e-mail"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                className="w-full rounded-xl px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-dynamo-blue-light/35 focus:border-dynamo-blue focus:outline-none focus:ring-2 focus:ring-dynamo-blue/25 tracking-widest font-mono text-center text-lg"
              />
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={loading}
                className="w-full rounded-xl py-3 font-semibold border-2 border-dynamo-blue text-dynamo-blue hover:bg-dynamo-blue/5 transition disabled:opacity-60"
              >
                {loading ? 'Bezig...' : 'Inloggen met code'}
              </button>
            </div>
          )}

          {!magicLinkMode && (
            <>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl pl-4 pr-12 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-dynamo-blue-light/35 focus:border-dynamo-blue focus:outline-none focus:ring-2 focus:ring-dynamo-blue/25"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-sm text-dynamo-blue/50 hover:bg-dynamo-blue/5"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-sm text-dynamo-blue hover:text-dynamo-blue-dark font-medium"
                >
                  Wachtwoord vergeten?
                </button>
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-dynamo-blue text-white rounded-xl py-3 font-semibold hover:opacity-90 transition disabled:opacity-60"
        >
          {loading ? 'Bezig...' : magicLinkMode ? 'Stuur inloglink' : 'Inloggen'}
        </button>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => {
              setMagicLinkMode(v => !v)
              setError('')
              setMessage('')
              setOtpCode('')
            }}
            className="text-sm text-dynamo-blue/45 hover:text-dynamo-blue/70"
          >
            {magicLinkMode ? '← Inloggen met wachtwoord' : 'Inloggen via e-mail (magic link)'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-dynamo-page px-4 py-6">
        <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl border border-dynamo-blue-light/40 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
          <div className="h-4 bg-gray-100 rounded w-3/4 mb-6" />
          <div className="h-12 bg-gray-100 rounded mb-4" />
          <div className="h-12 bg-gray-100 rounded" />
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}