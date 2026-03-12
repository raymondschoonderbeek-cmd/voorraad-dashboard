'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function InstellingenPage() {
  const searchParams = useSearchParams()
  const mfaVerplicht = searchParams.get('mfa') === 'verplicht'
  const [mfaFactors, setMfaFactors] = useState<{ id: string; friendly_name?: string }[]>([])
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaVerifyCode, setMfaVerifyCode] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [mfaSuccess, setMfaSuccess] = useState('')
  const [lunchSaving, setLunchSaving] = useState(false)
  const supabase = createClient()

  const { data: profileData, mutate: mutateProfile } = useSWR<{ lunch_module_enabled?: boolean }>('/api/profile', fetcher)
  const lunchModuleEnabled = profileData?.lunch_module_enabled === true

  async function toggleLunchModule(enabled: boolean) {
    setLunchSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunch_module_enabled: enabled }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      mutateProfile({ lunch_module_enabled: enabled })
    } catch {
      setMfaError('Lunch-module voorkeur kon niet worden opgeslagen.')
    }
    setLunchSaving(false)
  }

  async function loadMfaFactors() {
    const { data } = await supabase.auth.mfa.listFactors()
    setMfaFactors(data?.totp ?? [])
  }

  useEffect(() => {
    loadMfaFactors()
  }, [])

  async function startMfaEnroll() {
    setMfaError('')
    setMfaSuccess('')
    setMfaEnrolling(true)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      })
      if (error) throw error
      setMfaQr(data.totp.qr_code)
      setMfaFactorId(data.id)
    } catch (e: unknown) {
      setMfaError(e instanceof Error ? e.message : 'Starten mislukt')
    }
    setMfaEnrolling(false)
  }

  async function confirmMfaEnroll() {
    if (!mfaFactorId || mfaVerifyCode.length !== 6) return
    setMfaError('')
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (chErr) throw chErr
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge!.id,
        code: mfaVerifyCode,
      })
      if (verifyErr) throw verifyErr
      setMfaSuccess('MFA ingeschakeld.')
      setMfaQr('')
      setMfaFactorId('')
      setMfaVerifyCode('')
      loadMfaFactors()
    } catch (e: unknown) {
      setMfaError(e instanceof Error ? e.message : 'Verificatie mislukt')
    }
  }

  async function unenrollMfa(factorId: string) {
    if (!confirm('MFA uitschakelen? Je moet dan opnieuw een code invoeren bij inloggen vanaf een niet-vertrouwd IP.')) return
    setMfaError('')
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      setMfaSuccess('MFA uitgeschakeld.')
      loadMfaFactors()
    } catch (e: unknown) {
      setMfaError(e instanceof Error ? e.message : 'Uitschakelen mislukt')
    }
  }

  function cancelMfaEnroll() {
    setMfaQr('')
    setMfaFactorId('')
    setMfaVerifyCode('')
    setMfaError('')
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6">
        {/* Lunch module */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">🥪 Lunch bestellingen</h2>
              <p className="text-sm text-gray-500 mt-1">
                Schakel de lunch-module in om broodjes te kunnen bestellen op kantoor.
              </p>
            </div>
            <Link href="/dashboard" className="text-sm font-medium text-gray-600 hover:text-gray-900 shrink-0">
              ← Dashboard
            </Link>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Lunch module aan</span>
            <button
              type="button"
              role="switch"
              aria-checked={lunchModuleEnabled}
              disabled={lunchSaving}
              onClick={() => toggleLunchModule(!lunchModuleEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                lunchModuleEnabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  lunchModuleEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {lunchSaving && <p className="mt-2 text-xs text-gray-500">Opslaan...</p>}
        </div>

        {/* MFA */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold">🔐 Twee-factor authenticatie</h1>
              <p className="text-sm text-gray-500 mt-1">
                Voeg een extra beveiligingslaag toe. Vanaf kantoor (vertrouwd IP) is geen MFA nodig. Vanaf thuis of elders wel.
              </p>
            </div>
          </div>

          {mfaVerplicht && mfaFactors.length === 0 && (
            <div className="rounded-lg p-3 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200">
              MFA is verplicht voor jouw account. Schakel het hieronder in om verder te gaan.
            </div>
          )}
          {mfaError && <div className="rounded-lg p-2 text-sm text-red-600 bg-red-50">{mfaError}</div>}
          {mfaSuccess && <div className="rounded-lg p-2 text-sm text-green-700 bg-green-50">{mfaSuccess}</div>}

          {mfaFactors.length > 0 && !mfaQr && (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">MFA is ingeschakeld.</p>
              {mfaFactors.map(f => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <span className="text-sm">{f.friendly_name ?? 'Authenticator'}</span>
                  <button
                    type="button"
                    onClick={() => unenrollMfa(f.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Uitschakelen
                  </button>
                </div>
              ))}
            </div>
          )}

          {mfaQr ? (
            <div className="space-y-3 rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium">Scan de QR-code met je authenticator-app (Google Authenticator, Authy, 1Password):</p>
              <div className="flex justify-center">
                <img src={mfaQr} alt="QR code" className="w-48 h-48" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-cijferige code"
                  value={mfaVerifyCode}
                  onChange={e => setMfaVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 rounded-lg px-3 py-2 text-sm border border-gray-300"
                />
                <button
                  type="button"
                  onClick={confirmMfaEnroll}
                  disabled={mfaVerifyCode.length !== 6}
                  className="rounded-lg px-4 py-2 text-sm font-semibold bg-blue-600 text-white disabled:opacity-50"
                >
                  Bevestigen
                </button>
                <button type="button" onClick={cancelMfaEnroll} className="rounded-lg px-3 py-2 text-sm border border-gray-300 hover:bg-gray-50">
                  Annuleren
                </button>
              </div>
            </div>
          ) : mfaFactors.length === 0 && (
            <button
              type="button"
              onClick={startMfaEnroll}
              disabled={mfaEnrolling}
              className="rounded-xl px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {mfaEnrolling ? 'Bezig...' : 'MFA inschakelen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
