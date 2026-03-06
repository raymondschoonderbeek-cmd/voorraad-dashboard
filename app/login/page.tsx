'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [magicLinkMode, setMagicLinkMode] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'auth') setError('Inloggen mislukt. Probeer opnieuw of gebruik je wachtwoord.')
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (magicLinkMode) {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (otpError) {
        setError(otpError.message)
      } else {
        setMessage('Check je e-mail voor de inloglink. Klik op de link om in te loggen.')
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
      router.push('/dashboard')
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
      setError(error.message)
    } else {
      setMessage('Reset e-mail verstuurd. Controleer je inbox.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-5"
      >
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inloggen</h1>
          <p className="text-sm text-gray-500 mt-1">
            Log in om je voorraad dashboard te beheren.
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
            className="w-full rounded-xl px-4 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {!magicLinkMode && (
            <>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Wachtwoord"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl pl-4 pr-12 py-3 bg-white text-gray-900 placeholder:text-gray-400 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>

              <div className="text-right">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
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
          className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition disabled:opacity-60"
        >
          {loading ? 'Bezig...' : magicLinkMode ? 'Stuur inloglink' : 'Inloggen'}
        </button>

        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => { setMagicLinkMode(v => !v); setError(''); setMessage(''); }}
            className="text-sm text-gray-500 hover:text-gray-700"
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
        <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 animate-pulse">
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