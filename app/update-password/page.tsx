'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function UpdatePassword() {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mustChange, setMustChange] = useState<boolean | null>(null)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetch('/api/auth/session-info')
      .then(r => r.json())
      .then(d => setMustChange(d?.mustChangePassword === true))
      .catch(() => setMustChange(false))
  }, [])

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      await fetch('/api/profile/clear-must-change-password', { method: 'POST' })
      setMessage('Wachtwoord succesvol gewijzigd.')
      setTimeout(() => router.push('/dashboard'), 1500)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-6">
      <form
        onSubmit={handleUpdate}
        className="w-full max-w-md bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-200 space-y-5"
      >
        <h1 className="text-2xl font-bold text-gray-900">
          {mustChange ? 'Wijzig je wachtwoord' : 'Nieuw wachtwoord instellen'}
        </h1>
        {mustChange && (
          <p className="text-sm text-gray-600">
            Na je eerste inlog moet je een nieuw wachtwoord kiezen.
          </p>
        )}

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

        <input
          type="password"
          placeholder="Nieuw wachtwoord"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full rounded-xl px-4 py-3 bg-white text-gray-900 border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition disabled:opacity-60"
        >
          {loading ? 'Bezig...' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </div>
  )
}