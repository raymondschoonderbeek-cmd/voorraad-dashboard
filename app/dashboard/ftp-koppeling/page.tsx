'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DYNAMO_BLUE, dashboardUi, FONT_FAMILY } from '@/lib/theme'

const F = FONT_FAMILY

interface LaatsteStatus {
  status: string
  created_at: string
}

interface FtpTaak {
  id: number
  naam: string
  ftp_host: string | null
  ftp_pad: string
  actief: boolean
  webhook_secret: string | null
  updated_at: string | null
  laatste_status: LaatsteStatus | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    ok:            { bg: '#dcfce7', fg: '#15803d', label: 'Gelukt' },
    deels_ok:      { bg: '#fef9c3', fg: '#b45309', label: 'Deels gelukt' },
    fout:          { bg: '#fee2e2', fg: '#b91c1c', label: 'Fout' },
    auth_fout:     { bg: '#fee2e2', fg: '#b91c1c', label: 'Auth fout' },
    geen_bijlagen: { bg: 'rgba(45,69,124,0.08)', fg: 'rgba(45,69,124,0.6)', label: 'Geen bijlagen' },
  }
  const s = map[status] ?? { bg: 'rgba(45,69,124,0.08)', fg: 'rgba(45,69,124,0.6)', label: status }
  return (
    <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: s.bg, color: s.fg, fontFamily: F }}>
      {s.label}
    </span>
  )
}

export default function FtpKoppelingPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [taken, setTaken] = useState<FtpTaak[]>([])
  const [laden, setLaden] = useState(true)
  const [verwijderBezig, setVerwijderBezig] = useState<number | null>(null)

  const laadTaken = async () => {
    setLaden(true)
    const res = await fetch('/api/admin/ftp-koppeling')
    const data = await res.json() as { taken?: FtpTaak[] }
    setTaken(data.taken ?? [])
    setLaden(false)
  }

  useEffect(() => {
    async function check() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({})) as { isAdmin?: boolean }
      if (!info.isAdmin) { setAllowed(false); return }
      setAllowed(true)
      void laadTaken()
    }
    void check()
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  async function verwijder(id: number) {
    if (!confirm('Taak verwijderen? Dit kan niet ongedaan worden gemaakt.')) return
    setVerwijderBezig(id)
    await fetch(`/api/admin/ftp-koppeling/${id}`, { method: 'DELETE' })
    setVerwijderBezig(null)
    void laadTaken()
  }

  if (allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: dashboardUi.pageBg, fontFamily: F, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }
  if (!allowed) return null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: dashboardUi.pageBg, fontFamily: F }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-4 sm:px-6 flex items-center gap-3 py-3 min-h-[52px]">
          <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white border border-white/10 hover:opacity-90 shrink-0">
            ← Portal
          </Link>
          <span className="text-white text-sm font-semibold">Freshdesk → FTP koppelingen</span>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold m-0" style={{ color: DYNAMO_BLUE }}>FTP-koppelingen</h1>
            <p className="text-sm m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
              Bijlagen van Freshdesk-tickets automatisch uploaden naar FTP.
            </p>
          </div>
          <Link
            href="/dashboard/ftp-koppeling/nieuw"
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            style={{ background: DYNAMO_BLUE, fontFamily: F }}
          >
            + Nieuwe taak
          </Link>
        </div>

        {laden ? (
          <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Laden…</p>
        ) : taken.length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
            <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Nog geen taken aangemaakt.</p>
            <Link href="/dashboard/ftp-koppeling/nieuw" className="mt-3 inline-block text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
              Maak je eerste taak aan →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {taken.map(taak => (
              <div key={taak.id} className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.1)' }}>
                <div className="flex items-start gap-3">
                  {/* Actief/inactief indicator */}
                  <div className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: taak.actief ? '#22c55e' : 'rgba(45,69,124,0.2)', marginTop: 6 }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{taak.naam}</span>
                      {!taak.actief && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.08)', color: 'rgba(45,69,124,0.5)' }}>
                          Inactief
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-xs space-y-0.5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
                      {taak.ftp_host ? (
                        <p className="m-0">{taak.ftp_host}{taak.ftp_pad && taak.ftp_pad !== '/' ? taak.ftp_pad : ''}</p>
                      ) : (
                        <p className="m-0 italic">FTP nog niet ingesteld</p>
                      )}
                    </div>

                    {taak.laatste_status && (
                      <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={taak.laatste_status.status} />
                        <span className="text-xs" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>
                          {new Date(taak.laatste_status.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {!taak.laatste_status && (
                      <p className="mt-2 text-xs italic" style={{ color: 'rgba(45,69,124,0.3)', fontFamily: F }}>Nog geen activiteit</p>
                    )}
                  </div>

                  {/* Acties */}
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`/dashboard/ftp-koppeling/${taak.id}`}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                      style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F, background: 'white' }}
                    >
                      Bewerken
                    </Link>
                    <button
                      type="button"
                      onClick={() => void verwijder(taak.id)}
                      disabled={verwijderBezig === taak.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-40"
                      style={{ border: '1px solid rgba(220,38,38,0.2)', color: '#b91c1c', fontFamily: F, background: 'white' }}
                    >
                      {verwijderBezig === taak.id ? '…' : 'Verwijder'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
