'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

async function fetcherJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Verzoek mislukt')
  return data as T
}

type MijnHardwareRow = {
  id: string
  serial_number: string
  hostname: string
  intune: string | null
  user_name: string | null
  device_type: string | null
  notes: string | null
  location: string | null
  updated_at: string
}

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

  const { data: profileData, mutate: mutateProfile } = useSWR<{
    lunch_module_enabled?: boolean
    lunch_reminder_opt_out?: boolean
  }>('/api/profile', fetcher)
  const { data: newsPrefData, mutate: mutateNewsPref } = useSWR<{ weekly_digest_enabled: boolean }>(
    '/api/news/preferences',
    fetcher,
    { shouldRetryOnError: false }
  )
  const { data: mijnHardwareData, error: mijnHardwareError } = useSWR<{ items: MijnHardwareRow[] }>(
    '/api/it-cmdb/mijn-hardware',
    fetcherJson,
    { shouldRetryOnError: false }
  )
  const mijnHardware = mijnHardwareData?.items ?? []
  const lunchModuleEnabled = profileData?.lunch_module_enabled === true
  const lunchReminderOptOut = profileData?.lunch_reminder_opt_out === true
  const weeklyDigestEnabled = newsPrefData?.weekly_digest_enabled !== false
  const [newsPrefSaving, setNewsPrefSaving] = useState(false)

  async function toggleLunchModule(enabled: boolean) {
    setLunchSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunch_module_enabled: enabled }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      mutateProfile({ ...profileData, lunch_module_enabled: enabled })
    } catch {
      setMfaError('Lunch-module voorkeur kon niet worden opgeslagen.')
    }
    setLunchSaving(false)
  }

  async function toggleWeeklyDigest(enabled: boolean) {
    setNewsPrefSaving(true)
    try {
      const res = await fetch('/api/news/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_digest_enabled: enabled }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      mutateNewsPref({ weekly_digest_enabled: enabled })
    } catch {
      setMfaError('Voorkeur voor nieuwsbrief kon niet worden opgeslagen.')
    }
    setNewsPrefSaving(false)
  }

  async function toggleLunchReminderOptOut(optOut: boolean) {
    setLunchSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lunch_reminder_opt_out: optOut }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      mutateProfile({ ...profileData, lunch_reminder_opt_out: optOut })
    } catch {
      setMfaError('Voorkeur voor herinneringsmail kon niet worden opgeslagen.')
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
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Mijn instellingen</h1>
          <p className="text-sm text-gray-500">Voorkeuren voor het DRG-portal, beveiliging en je toegewezen IT-middelen.</p>
        </header>

        {/* IT-hardware aan deze gebruiker */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">💻 Mijn IT-apparaten</h2>
              <p className="text-sm text-gray-500 mt-1">
                Apparaten die in het interne hardware-overzicht aan jouw portalaccount zijn gekoppeld.
              </p>
            </div>
          </div>
          {mijnHardwareError ? (
            <p className="mt-4 text-sm text-amber-800">
              Hardwareoverzicht kon niet worden geladen. Controleer of de database bijgewerkt is, of probeer het later opnieuw.
            </p>
          ) : mijnHardware.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">
              Er zijn nog geen apparaten aan jouw account gekoppeld. IT kan dit koppelen in het CMDB-overzicht.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm text-left min-w-[520px]">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-3 py-2 font-semibold text-gray-700">Serie</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Hostname</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Type</th>
                    <th className="px-3 py-2 font-semibold text-gray-700">Locatie</th>
                  </tr>
                </thead>
                <tbody>
                  {mijnHardware.map(row => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-gray-900">{row.serial_number}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-800">{row.hostname || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{row.device_type || '—'}</td>
                      <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{row.location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
              ← DRG Portal
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
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-dynamo-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                lunchModuleEnabled ? 'bg-dynamo-blue' : 'bg-gray-200'
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
          {lunchModuleEnabled && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">E-mailherinnering lunch</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Ontvang een herinnering op de ingestelde dag (indien ingeschakeld door beheer).
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!lunchReminderOptOut}
                  disabled={lunchSaving}
                  onClick={() => toggleLunchReminderOptOut(!lunchReminderOptOut)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-dynamo-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    !lunchReminderOptOut ? 'bg-dynamo-blue' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      !lunchReminderOptOut ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Uit = geen herinneringsmails (je kunt nog wel via het portaal bestellen).
              </p>
            </div>
          )}
        </div>

        {/* Intern nieuws — e-mail digest */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">📰 Intern nieuws</h2>
              <p className="text-sm text-gray-500 mt-1">
                Wekelijkse samenvatting per e-mail (indien aan staat in het portaal). Beheer stuurt berichten via Beheer → Nieuws.
              </p>
            </div>
            <Link href="/dashboard/nieuws" className="text-sm font-medium text-gray-600 hover:text-gray-900 shrink-0">
              Naar nieuws →
            </Link>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Wekelijkse e-mail met nieuws</span>
            <button
              type="button"
              role="switch"
              aria-checked={weeklyDigestEnabled}
              disabled={newsPrefSaving || newsPrefData === undefined}
              onClick={() => toggleWeeklyDigest(!weeklyDigestEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-dynamo-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                weeklyDigestEnabled ? 'bg-dynamo-blue' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  weeklyDigestEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          {newsPrefSaving && <p className="mt-2 text-xs text-gray-500">Opslaan...</p>}
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
                  className="rounded-lg px-4 py-2 text-sm font-semibold bg-dynamo-blue text-white disabled:opacity-50"
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
              className="rounded-xl px-4 py-2 text-sm font-semibold bg-dynamo-blue text-white hover:opacity-90 disabled:opacity-50"
            >
              {mfaEnrolling ? 'Bezig...' : 'MFA inschakelen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
