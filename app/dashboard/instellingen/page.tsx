'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import useSWR from 'swr'
import { useToast } from '@/components/Toast'
import { DYNAMO_BLUE } from '@/lib/theme'

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

type MijnAanvraagRow = {
  id: string
  catalogus_naam: string
  status: 'ingediend' | 'wacht_op_manager' | 'goedgekeurd' | 'afgekeurd'
  motivatie: string | null
  manager_naam: string | null
  manager_notitie: string | null
  manager_beslissing_op: string | null
  created_at: string
}

type MijnCatalogusRow = {
  catalogus_id: string
  naam: string
  type: 'product' | 'licentie'
  categorie: string
  leverancier: string
  versie: string | null
  toegewezen_op: string
  serienummer: string | null
  datum_ingebruik: string | null
}

type CatalogusItem = {
  id: string
  naam: string
  categorie: string
  leverancier: string
  versie: string | null
  kosten_per_eenheid: number | null
}

export default function InstellingenPage() {
  const searchParams = useSearchParams()
  const mfaVerplicht = searchParams.get('mfa') === 'verplicht'
  const [mfaFactors, setMfaFactors] = useState<{ id: string; friendly_name?: string }[]>([])
  const [mfaEnrolling, setMfaEnrolling] = useState(false)
  const [mfaQr, setMfaQr] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaVerifyCode, setMfaVerifyCode] = useState('')
  const [lunchSaving, setLunchSaving] = useState(false)
  const toast = useToast()
  const supabase = createClient()

  const { data: profileData, mutate: mutateProfile } = useSWR<{
    lunch_module_enabled?: boolean
    lunch_reminder_opt_out?: boolean
    geboortedatum?: string | null
    weergave_naam?: string | null
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
  const { data: mijnCatalogusData, error: mijnCatalogusError } = useSWR<{ items: MijnCatalogusRow[] }>(
    '/api/it-cmdb/mijn-catalogus',
    fetcherJson,
    { shouldRetryOnError: false }
  )
  const { data: mijnAanvragenData, mutate: mutateMijnAanvragen } = useSWR<{ aanvragen: MijnAanvraagRow[] }>(
    '/api/it-cmdb/aanvragen',
    fetcherJson,
    { shouldRetryOnError: false }
  )
  const { data: catalogusData } = useSWR<{ items: CatalogusItem[] }>(
    '/api/it-cmdb/aanvraag-catalogus',
    fetcherJson,
    { shouldRetryOnError: false }
  )
  const mijnHardware = mijnHardwareData?.items ?? []
  const mijnCatalogus = mijnCatalogusData?.items ?? []
  const mijnAanvragen = mijnAanvragenData?.aanvragen ?? []
  const alleCatalogus = catalogusData?.items ?? []
  const [aanvraagModalItem, setAanvraagModalItem] = useState<{ id: string; naam: string } | null>(null)
  const [aanvraagMotivatie, setAanvraagMotivatie] = useState('')
  const [aanvraagLoading, setAanvraagLoading] = useState(false)

  const lunchModuleEnabled = profileData?.lunch_module_enabled === true
  const lunchReminderOptOut = profileData?.lunch_reminder_opt_out === true
  const weeklyDigestEnabled = newsPrefData?.weekly_digest_enabled !== false
  const [newsPrefSaving, setNewsPrefSaving] = useState(false)
  const [weergaveNaam, setWeergaveNaam] = useState('')
  const [geboortedatum, setGeboortedatum] = useState('')
  const [profielSaving, setProfielSaving] = useState(false)
  useEffect(() => {
    if (profileData) {
      setWeergaveNaam(profileData.weergave_naam ?? '')
      setGeboortedatum(profileData.geboortedatum ?? '')
    }
  }, [profileData?.weergave_naam, profileData?.geboortedatum])

  async function slaProfielOp() {
    setProfielSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weergave_naam: weergaveNaam, geboortedatum: geboortedatum || null }),
      })
      if (!res.ok) throw new Error('Opslaan mislukt')
      mutateProfile({ ...profileData, weergave_naam: weergaveNaam || null, geboortedatum: geboortedatum || null })
      toast('Profiel opgeslagen.', 'success')
    } catch {
      toast('Profiel kon niet worden opgeslagen.', 'error')
    }
    setProfielSaving(false)
  }

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
      toast(enabled ? 'Lunch-module ingeschakeld.' : 'Lunch-module uitgeschakeld.', 'success')
    } catch {
      toast('Lunch-module voorkeur kon niet worden opgeslagen.', 'error')
    }
    setLunchSaving(false)
  }

  function sluitAanvraagModal() {
    setAanvraagModalItem(null)
    setAanvraagMotivatie('')
  }

  async function dientAanvraagIn(catalogusId: string, productNaam: string) {
    setAanvraagLoading(true)
    try {
      const res = await fetch('/api/it-cmdb/aanvragen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogus_id: catalogusId,
          motivatie: aanvraagMotivatie.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Indienen mislukt')
      toast(`Aanvraag voor "${productNaam}" ingediend.`, 'success')
      sluitAanvraagModal()
      void mutateMijnAanvragen()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Indienen mislukt', 'error')
    } finally {
      setAanvraagLoading(false)
    }
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
      toast(enabled ? 'Wekelijkse e-mail ingeschakeld.' : 'Wekelijkse e-mail uitgeschakeld.', 'success')
    } catch {
      toast('Voorkeur voor nieuwsbrief kon niet worden opgeslagen.', 'error')
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
      toast(!optOut ? 'Lunchherinnering ingeschakeld.' : 'Lunchherinnering uitgeschakeld.', 'success')
    } catch {
      toast('Voorkeur voor herinneringsmail kon niet worden opgeslagen.', 'error')
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
      toast(e instanceof Error ? e.message : 'Starten mislukt', 'error')
    }
    setMfaEnrolling(false)
  }

  async function confirmMfaEnroll() {
    if (!mfaFactorId || mfaVerifyCode.length !== 6) return
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
      if (chErr) throw chErr
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge!.id,
        code: mfaVerifyCode,
      })
      if (verifyErr) throw verifyErr
      toast('MFA ingeschakeld.', 'success')
      setMfaQr('')
      setMfaFactorId('')
      setMfaVerifyCode('')
      loadMfaFactors()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Verificatie mislukt', 'error')
    }
  }

  async function unenrollMfa(factorId: string) {
    if (!confirm('MFA uitschakelen? Je moet dan opnieuw een code invoeren bij inloggen vanaf een niet-vertrouwd IP.')) return
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw error
      toast('MFA uitgeschakeld.', 'info')
      loadMfaFactors()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Uitschakelen mislukt', 'error')
    }
  }

  function cancelMfaEnroll() {
    setMfaQr('')
    setMfaFactorId('')
    setMfaVerifyCode('')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--drg-text-subtle)', margin: 0 }}>Instellingen</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--drg-ink-2)', margin: '2px 0 0' }}>Mijn instellingen</h1>
          <p style={{ fontSize: 13, color: 'var(--drg-text-muted)', margin: '2px 0 0' }}>Voorkeuren voor het DRG-portal, beveiliging en je toegewezen IT-middelen.</p>
        </header>

        {/* Beschikbaarheid */}
        <Link
          href="/dashboard/instellingen/beschikbaarheid"
          className="flex items-center justify-between rounded-[10px] shadow-sm p-6 hover:shadow-md transition-shadow group" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}
        >
          <div>
            <h2 className="text-lg font-bold transition-colors" style={{ color: 'var(--drg-ink-2)' }}>🕐 Beschikbaarheid</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
              Stel je werktijden en out-of-office in. Synchroniseert met Microsoft 365.
            </p>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="shrink-0" style={{ color: 'var(--drg-text-subtle)' }} aria-hidden>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        {/* IT-hardware aan deze gebruiker */}
        <div className="rounded-[10px] shadow-sm p-6" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--drg-ink-2)' }}>💻 Mijn IT-apparaten</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
                Apparaten die in het interne hardware-overzicht aan jouw portalaccount zijn gekoppeld.
              </p>
            </div>
          </div>
          {mijnHardwareError ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--drg-warn)' }}>
              Hardwareoverzicht kon niet worden geladen. Controleer of de database bijgewerkt is, of probeer het later opnieuw.
            </p>
          ) : mijnHardware.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--drg-text-muted)' }}>
              Er zijn nog geen apparaten aan jouw account gekoppeld. IT kan dit koppelen in het CMDB-overzicht.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg" style={{ border: '1px solid var(--drg-line)' }}>
              <table className="w-full text-sm text-left min-w-[520px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--drg-line)', background: 'rgba(45,69,124,0.03)' }}>
                    <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Serie</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Hostname</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Type</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Locatie</th>
                  </tr>
                </thead>
                <tbody>
                  {mijnHardware.map(row => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--drg-line)' }} className="last:border-0">
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--drg-ink)' }}>{row.serial_number}</td>
                      <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--drg-ink)' }}>{row.hostname || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--drg-ink)' }}>{row.device_type || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--drg-ink)' }}>{row.location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Producten & licenties */}
        <div className="rounded-[10px] shadow-sm p-6" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--drg-ink-2)' }}>📦 Mijn producten &amp; licenties</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
                Software-licenties en IT-producten die door IT aan jouw account zijn toegewezen.
              </p>
            </div>
          </div>
          {mijnCatalogusError ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--drg-warn)' }}>
              Overzicht kon niet worden geladen. Probeer het later opnieuw.
            </p>
          ) : !mijnCatalogusData ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--drg-text-subtle)' }}>Laden…</p>
          ) : mijnCatalogus.length === 0 ? (
            <p className="mt-4 text-sm" style={{ color: 'var(--drg-text-muted)' }}>
              Er zijn nog geen producten of licenties aan jouw account gekoppeld.
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {(['licentie', 'product'] as const).map(type => {
                const rijen = mijnCatalogus.filter(r => r.type === type)
                if (rijen.length === 0) return null
                return (
                  <div key={type}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--drg-text-subtle)' }}>
                      {type === 'licentie' ? 'Licenties' : 'Producten'}
                    </p>
                    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--drg-line)' }}>
                      <table className="w-full text-sm text-left min-w-[520px]">
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--drg-line)', background: 'rgba(45,69,124,0.03)' }}>
                            <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Naam</th>
                            <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Leverancier</th>
                            <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Versie</th>
                            {type === 'product' && <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>Serienummer</th>}
                            {type === 'product' && <th className="px-3 py-2 font-semibold" style={{ color: 'var(--drg-ink-2)' }}>In gebruik sinds</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rijen.map(row => (
                            <tr key={row.catalogus_id} style={{ borderBottom: '1px solid var(--drg-line)' }} className="last:border-0">
                              <td className="px-3 py-2 font-medium" style={{ color: 'var(--drg-ink)' }}>{row.naam}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--drg-text-muted)' }}>{row.leverancier}</td>
                              <td className="px-3 py-2" style={{ color: 'var(--drg-text-subtle)' }}>{row.versie ?? '—'}</td>
                              {type === 'product' && (
                                <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--drg-text-muted)' }}>{row.serienummer ?? '—'}</td>
                              )}
                              {type === 'product' && (
                                <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--drg-text-muted)' }}>
                                  {row.datum_ingebruik
                                    ? new Date(row.datum_ingebruik).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
                                    : '—'}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Mijn aanvragen */}
        <div className="rounded-[10px] shadow-sm p-6" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--drg-ink-2)' }}>📋 Mijn software-aanvragen</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--drg-text-muted)' }}>
            Overzicht van jouw ingediende licentie-aanvragen. Je kunt alleen voor jezelf een aanvraag indienen.
          </p>

          {mijnAanvragen.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--drg-text-subtle)' }}>Nog geen aanvragen ingediend.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--drg-line)' }}>
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr style={{ background: 'rgba(45,69,124,0.03)', borderBottom: '1px solid var(--drg-line)' }}>
                    {['Product', 'Status', 'Manager', 'Ingediend'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--drg-ink-2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mijnAanvragen.map(a => {
                    const statusMeta = {
                      ingediend: { label: 'Ingediend', bg: 'rgba(45,69,124,0.08)', fg: 'var(--drg-ink-2)' },
                      wacht_op_manager: { label: 'Wacht op manager', bg: '#fef9c3', fg: '#854d0e' },
                      goedgekeurd: { label: 'Goedgekeurd', bg: '#dcfce7', fg: '#15803d' },
                      afgekeurd: { label: 'Afgekeurd', bg: '#fee2e2', fg: '#b91c1c' },
                    }[a.status] ?? { label: a.status, bg: 'rgba(45,69,124,0.08)', fg: 'var(--drg-ink-2)' }
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--drg-line)' }} className="last:border-0">
                        <td className="px-3 py-2.5">
                          <div className="font-medium" style={{ color: 'var(--drg-ink)' }}>{a.catalogus_naam}</div>
                          {a.motivatie && <div className="text-xs truncate max-w-[200px]" style={{ color: 'var(--drg-text-subtle)' }} title={a.motivatie}>{a.motivatie}</div>}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: statusMeta.bg, color: statusMeta.fg }}>
                            {statusMeta.label}
                          </span>
                          {a.manager_notitie && (
                            <div className="text-xs mt-0.5 max-w-[160px] truncate" style={{ color: 'var(--drg-text-subtle)' }} title={a.manager_notitie}>
                              &ldquo;{a.manager_notitie}&rdquo;
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--drg-text-muted)' }}>{a.manager_naam ?? '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: 'var(--drg-text-subtle)' }}>
                          {new Date(a.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Nieuwe aanvraag indienen — inline catalogus */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--drg-line)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--drg-ink)' }}>Nieuwe aanvraag indienen</p>
            <p className="text-xs mb-3" style={{ color: 'var(--drg-text-subtle)' }}>Alleen licenties die door IT als &ldquo;aanvraagbaar&rdquo; zijn gemarkeerd, staan hier. Andere producten vraag je aan via IT.</p>
            {!catalogusData ? (
              <p className="text-sm" style={{ color: 'var(--drg-text-subtle)' }}>Catalogus laden…</p>
            ) : (() => {
              const heeftIds = new Set(mijnCatalogus.map(r => r.catalogus_id))
              const openstaandeIds = new Set(
                mijnAanvragen
                  .filter(a => a.status === 'ingediend' || a.status === 'wacht_op_manager')
                  .map(a => a.catalogus_naam)
              )
              const beschikbaar = alleCatalogus.filter(item => !heeftIds.has(item.id))
              if (beschikbaar.length === 0) {
                return <p className="text-sm" style={{ color: 'var(--drg-text-subtle)' }}>Je hebt al toegang tot alle beschikbare licenties.</p>
              }
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {beschikbaar.map(item => {
                    const heeftOpenstaand = openstaandeIds.has(item.naam)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={heeftOpenstaand}
                        onClick={() => { setAanvraagModalItem({ id: item.id, naam: item.naam }); setAanvraagMotivatie('') }}
                        className="flex items-start gap-3 text-left rounded-xl border p-3 transition group disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          borderColor: heeftOpenstaand ? 'rgba(45,69,124,0.1)' : 'rgba(45,69,124,0.18)',
                          background: heeftOpenstaand ? '#f8fafc' : 'white',
                        }}
                        onMouseEnter={e => { if (!heeftOpenstaand) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(45,69,124,0.04)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = heeftOpenstaand ? '#f8fafc' : 'white' }}
                      >
                        <span className="mt-0.5 text-lg">📦</span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: 'var(--drg-ink)' }}>{item.naam}</div>
                          <div className="text-xs truncate" style={{ color: 'var(--drg-text-subtle)' }}>{item.leverancier}{item.categorie ? ` · ${item.categorie}` : ''}</div>
                          {heeftOpenstaand && (
                            <div className="text-xs text-amber-600 font-medium mt-0.5">Aanvraag loopt</div>
                          )}
                        </div>
                        {!heeftOpenstaand && (
                          <span className="ml-auto shrink-0 text-xs font-bold rounded-full px-2.5 py-0.5 self-center" style={{ background: 'rgba(45,69,124,0.08)', color: '#2D457C' }}>
                            Aanvragen
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Aanvraag modal (voor inline aanvraag vanuit instellingen) */}
        {aanvraagModalItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={e => { if (e.target === e.currentTarget) sluitAanvraagModal() }}>
            <div className="w-full max-w-md rounded-[10px] bg-white shadow-2xl p-7 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-lg font-bold" style={{ color: '#2D457C' }}>Licentie aanvragen</h3>
                <button type="button" onClick={sluitAanvraagModal} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
              </div>
              <p className="text-sm mb-5" style={{ color: 'var(--drg-text-muted)' }}>Je dient alleen een aanvraag in voor jezelf.</p>

              {/* Product */}
              <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(45,69,124,0.04)' }}>
                <div className="text-xs font-bold uppercase tracking-wide mb-0.5" style={{ color: 'rgba(45,69,124,0.5)' }}>Product</div>
                <div className="font-bold" style={{ color: '#2D457C' }}>{aanvraagModalItem.naam}</div>
              </div>

              {/* Motivatie */}
              <label className="text-sm font-medium block mb-1" style={{ color: 'var(--drg-ink)' }}>
                Motivatie <span className="font-normal" style={{ color: 'var(--drg-text-subtle)' }}>(optioneel)</span>
              </label>
              <textarea value={aanvraagMotivatie} onChange={e => setAanvraagMotivatie(e.target.value)} rows={3}
                placeholder="Waarom is deze licentie nodig?"
                className="w-full rounded-xl p-3 text-sm resize-none outline-none mb-5" style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }} />

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={sluitAanvraagModal}
                  className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80" style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}>
                  Annuleren
                </button>
                <button type="button" disabled={aanvraagLoading}
                  onClick={() => void dientAanvraagIn(aanvraagModalItem.id, aanvraagModalItem.naam)}
                  className="rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50 transition"
                  style={{ background: '#2D457C' }}>
                  {aanvraagLoading ? 'Bezig...' : 'Aanvraag indienen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Mijn profiel (TV-scherm) */}
        <div className="rounded-[10px] shadow-sm p-6 space-y-4" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--drg-ink-2)' }}>👤 Mijn profiel</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
              Je naam en verjaardag worden getoond op het TV-scherm in het kantoor.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--drg-text-muted)' }}>Weergavenaam</label>
              <input
                type="text"
                value={weergaveNaam}
                onChange={e => setWeergaveNaam(e.target.value)}
                placeholder="Bijv. Jan de Vries"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--drg-text-muted)' }}>Geboortedatum</label>
              <input
                type="date"
                value={geboortedatum}
                onChange={e => setGeboortedatum(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--drg-text-subtle)' }}>Alleen dag en maand worden op het TV-scherm getoond.</p>
            </div>
          </div>
          <button
            onClick={() => void slaProfielOp()}
            disabled={profielSaving}
            className="rounded-xl px-5 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: DYNAMO_BLUE }}
          >
            {profielSaving ? 'Opslaan…' : 'Profiel opslaan'}
          </button>
        </div>

        {/* Lunch module */}
        <div className="rounded-[10px] shadow-sm p-6" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--drg-ink-2)' }}>🥪 Lunch bestellingen</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
                Schakel de lunch-module in om broodjes te kunnen bestellen op kantoor.
              </p>
            </div>
            <Link href="/dashboard" className="text-sm font-medium shrink-0" style={{ color: 'var(--drg-text-muted)' }}>
              ← DRG Portal
            </Link>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--drg-ink)' }}>Lunch module aan</span>
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
          {lunchModuleEnabled && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--drg-line)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--drg-ink)' }}>E-mailherinnering lunch</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--drg-text-muted)' }}>
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
              <p className="text-xs mt-2" style={{ color: 'var(--drg-text-muted)' }}>
                Uit = geen herinneringsmails (je kunt nog wel via het portaal bestellen).
              </p>
            </div>
          )}
        </div>

        {/* Intern nieuws — e-mail digest */}
        <div className="rounded-[10px] shadow-sm p-6" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--drg-ink-2)' }}>📰 Intern nieuws</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
                Wekelijkse samenvatting per e-mail (indien aan staat in het portaal). Beheer stuurt berichten via Beheer → Nieuws.
              </p>
            </div>
            <Link href="/dashboard/nieuws" className="text-sm font-medium shrink-0" style={{ color: 'var(--drg-text-muted)' }}>
              Naar nieuws →
            </Link>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--drg-ink)' }}>Wekelijkse e-mail met nieuws</span>
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
        </div>

        {/* MFA */}
        <div className="rounded-[10px] shadow-sm p-6 space-y-4" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--drg-ink-2)' }}>🔐 Twee-factor authenticatie</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--drg-text-muted)' }}>
                Voeg een extra beveiligingslaag toe. Vanaf kantoor (vertrouwd IP) is geen MFA nodig. Vanaf thuis of elders wel.
              </p>
            </div>
          </div>

          {mfaVerplicht && mfaFactors.length === 0 && (
            <div className="rounded-lg p-3 text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200">
              MFA is verplicht voor jouw account. Schakel het hieronder in om verder te gaan.
            </div>
          )}
          {mfaFactors.length > 0 && !mfaQr && (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: 'var(--drg-ink)' }}>MFA is ingeschakeld.</p>
              {mfaFactors.map(f => (
                <div key={f.id} className="flex items-center justify-between rounded-lg p-3" style={{ border: '1px solid var(--drg-line)' }}>
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
            <div className="space-y-3 rounded-lg p-4" style={{ border: '1px solid var(--drg-line)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--drg-ink)' }}>Scan de QR-code met je authenticator-app (Google Authenticator, Authy, 1Password):</p>
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
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}
                />
                <button
                  type="button"
                  onClick={confirmMfaEnroll}
                  disabled={mfaVerifyCode.length !== 6}
                  className="rounded-lg px-4 py-2 text-sm font-semibold bg-dynamo-blue text-white disabled:opacity-50"
                >
                  Bevestigen
                </button>
                <button type="button" onClick={cancelMfaEnroll} className="rounded-lg px-3 py-2 text-sm hover:opacity-80 transition" style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', background: 'var(--drg-card-bg)' }}>
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
  )
}
