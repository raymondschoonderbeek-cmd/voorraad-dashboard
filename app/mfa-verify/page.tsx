'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function MfaVerifyPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) throw factorsError

      const totpFactor = factors?.totp?.[0]
      if (!totpFactor) {
        setError('Geen authenticator gevonden. Schakel eerst MFA in via Instellingen.')
        setLoading(false)
        return
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      })
      if (challengeError) throw challengeError

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge!.id,
        code: code.trim(),
      })
      if (verifyError) throw verifyError

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verificatie mislukt.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
      <form
        onSubmit={handleVerify}
        className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-5"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Extra verificatie</h1>
          <p className="text-sm text-gray-500 mt-1">
            Voer de 6-cijferige code in van je authenticator-app (Google Authenticator, Authy, etc.).
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          required
          className="w-full rounded-xl px-4 py-3 text-center text-lg tracking-[0.5em] bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoComplete="one-time-code"
        />

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition disabled:opacity-60"
        >
          {loading ? 'Controleren...' : 'Verifiëren'}
        </button>

        <p className="text-xs text-center text-gray-500">
          Log je in vanaf kantoor? Voeg je kantoor-IP toe aan TRUSTED_IPS om MFA over te slaan.
        </p>
      </form>
    </div>
  )
}
