'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Er ging iets mis</h1>
        <p className="text-gray-600 text-sm mb-6">
          {error.message || 'Er is een onverwachte fout opgetreden. Probeer de pagina te vernieuwen.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl font-semibold text-white bg-dynamo-blue hover:opacity-90 transition"
            aria-label="Probeer opnieuw"
          >
            Probeer opnieuw
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
          >
            Naar DRG Portal
          </Link>
        </div>
      </div>
    </div>
  )
}
