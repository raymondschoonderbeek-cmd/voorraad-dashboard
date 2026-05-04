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

interface SyncStatus {
  vendit_stock: { datum: string | null }
  sap_ledenlijst: { datum: string | null; status: string | null; regels_bijgewerkt: number | null }
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

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function syncOud(iso: string | null, maxUren: number): boolean {
  if (!iso) return true
  return (Date.now() - new Date(iso).getTime()) > maxUren * 60 * 60 * 1000
}

function SyncStatusKaart({ label, datum, maxUren, extra }: { label: string; datum: string | null; maxUren: number; extra?: string }) {
  const oud = syncOud(datum, maxUren)
  const kleur = datum === null ? 'rgba(45,69,124,0.4)' : oud ? '#b91c1c' : '#15803d'
  const bg = datum === null ? 'rgba(45,69,124,0.06)' : oud ? '#fee2e2' : '#dcfce7'
  const indicator = datum === null ? '?' : oud ? '!' : '✓'
  return (
    <div className="rounded-[10px] px-4 py-3 flex items-center gap-3" style={{ background: bg }}>
      <span className="text-base font-bold w-5 text-center shrink-0" style={{ color: kleur }}>{indicator}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold m-0" style={{ color: kleur, fontFamily: F }}>{label}</p>
        <p className="text-xs m-0 mt-0.5" style={{ color: kleur, opacity: 0.8, fontFamily: F }}>
          {datum ? `Laatste sync: ${formatDatum(datum)}` : 'Nog nooit gesynchroniseerd'}
          {extra ? ` · ${extra}` : ''}
        </p>
      </div>
    </div>
  )
}

export default function FtpKoppelingPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [taken, setTaken] = useState<FtpTaak[]>([])
  const [laden, setLaden] = useState(true)
  const [verwijderBezig, setVerwijderBezig] = useState<number | null>(null)
  const [kopieerBezig, setKopieerBezig] = useState<number | null>(null)
  const [nieuwBezig, setNieuwBezig] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)

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
      fetch('/api/admin/sync-status')
        .then(r => r.json())
        .then((d: SyncStatus) => setSyncStatus(d))
        .catch(() => null)
    }
    void check()
  }, [])

  useEffect(() => {
    if (allowed === false) router.replace('/dashboard')
  }, [allowed, router])

  async function maakNieuweTaak() {
    setNieuwBezig(true)
    const res = await fetch('/api/admin/ftp-koppeling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ naam: 'Nieuwe taak' }),
    })
    const data = await res.json() as { id?: number }
    if (data.id) router.push(`/dashboard/ftp-koppeling/${data.id}`)
    else setNieuwBezig(false)
  }

  async function kopieer(taak: FtpTaak) {
    setKopieerBezig(taak.id)
    const res = await fetch('/api/admin/ftp-koppeling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        naam: `Kopie van ${taak.naam}`,
        ftp_host: taak.ftp_host,
        ftp_pad: taak.ftp_pad,
        actief: false,
      }),
    })
    const data = await res.json() as { id?: number }
    setKopieerBezig(null)
    if (data.id) router.push(`/dashboard/ftp-koppeling/${data.id}`)
    else void laadTaken()
  }

  async function verwijder(id: number) {
    if (!confirm('Taak verwijderen? Dit kan niet ongedaan worden gemaakt.')) return
    setVerwijderBezig(id)
    await fetch(`/api/admin/ftp-koppeling/${id}`, { method: 'DELETE' })
    setVerwijderBezig(null)
    void laadTaken()
  }

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center text-sm" style={{ padding: '80px 28px', fontFamily: F, color: dashboardUi.textMuted }}>
        Laden…
      </div>
    )
  }
  if (!allowed) return null

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold m-0" style={{ color: 'var(--drg-ink)' }}>Integraties & statussen</h1>
            <p className="text-sm m-0 mt-1" style={{ color: dashboardUi.textMuted }}>
              Sync-statussen en FTP-uploadtaken voor externe koppelingen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void maakNieuweTaak()}
            disabled={nieuwBezig}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            style={{ background: DYNAMO_BLUE, fontFamily: F }}
          >
            {nieuwBezig ? 'Aanmaken…' : '+ Nieuwe taak'}
          </button>
        </div>

        {syncStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SyncStatusKaart
              label="Vendit stock"
              datum={syncStatus.vendit_stock.datum}
              maxUren={36}
            />
            <SyncStatusKaart
              label="SAP ledenlijst"
              datum={syncStatus.sap_ledenlijst.datum}
              maxUren={168}
              extra={syncStatus.sap_ledenlijst.regels_bijgewerkt != null ? `${syncStatus.sap_ledenlijst.regels_bijgewerkt} winkels` : undefined}
            />
          </div>
        )}

        {laden ? (
          <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Laden…</p>
        ) : taken.length === 0 ? (
          <div className="rounded-[10px] p-10 text-center" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
            <p className="text-sm" style={{ color: dashboardUi.textMuted }}>Nog geen taken aangemaakt.</p>
            <button type="button" onClick={() => void maakNieuweTaak()} disabled={nieuwBezig} className="mt-3 inline-block text-sm font-semibold disabled:opacity-60" style={{ color: DYNAMO_BLUE, background: 'none', border: 'none', cursor: 'pointer' }}>
              {nieuwBezig ? 'Aanmaken…' : 'Maak je eerste taak aan →'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {taken.map(taak => (
              <div key={taak.id} className="rounded-[10px] p-5" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)' }}>
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
                      onClick={() => void kopieer(taak)}
                      disabled={kopieerBezig === taak.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-40"
                      style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F, background: 'white' }}
                    >
                      {kopieerBezig === taak.id ? '…' : 'Kopieer'}
                    </button>
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
      </div>
  )
}
