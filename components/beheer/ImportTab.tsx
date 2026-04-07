'use client'

import { useState, useRef } from 'react'
import { DYNAMO_BLUE } from '@/lib/theme'

const F = "'Outfit', sans-serif"

type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
  postcode?: string
  straat?: string
  huisnummer?: string
  stad?: string
  land?: 'Netherlands' | 'Belgium' | null
  wilmar_organisation_id?: number | null
  wilmar_branch_id?: number | null
  wilmar_store_naam?: string | null
  api_type?: string | null
}

interface ImportTabProps {
  winkels: Winkel[]
  onRefreshGebruikers: () => Promise<void>
}

export function ImportTab({ winkels, onRefreshGebruikers }: ImportTabProps) {
  const [importType, setImportType] = useState<'winkels' | 'medewerkers'>('winkels')
  const [importData, setImportData] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; toegevoegd: number; bijgewerkt: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function verwerkExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(''); setImportSuccess(''); setImportData([])
    try {
      const XLSX = await import('xlsx' as any)
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      if (importType === 'medewerkers') {
        const parsed = rows.map(r => {
          const email = String(r.email || r.Email || r.EMAIL || r.mail || r.Mail || '').trim().toLowerCase()
          const rol = String(r.rol || r.Rol || r.ROL || r.role || '').trim().toLowerCase()
          return {
            email,
            naam: String(r.naam || r.Naam || r.NAAM || r.name || r.Name || '').trim() || email,
            rol: ['viewer', 'lunch', 'admin'].includes(rol) ? rol : 'viewer',
          }
        }).filter(r => r.email)
        if (parsed.length === 0) {
          const heeftRijen = rows.length > 0
          setImportError(heeftRijen
            ? 'Geen geldige rijen gevonden. Elke rij moet een e-mail hebben. Kolomnamen: email, Email, of mail.'
            : 'Geen data gevonden. Zorg dat het bestand een eerste rij met kolomnamen heeft (email, naam, rol) en daarna de data.')
        } else {
          setImportData(parsed)
        }
      } else {
        const parsed = rows.map(r => {
          const apiVal = String(r.api_type || r['API type'] || r.apiType || '').trim().toLowerCase()
          const landVal = String(r.land || r.Land || r.LAND || '').trim().toLowerCase()
          const dealer = String(r.dealer_nummer || r['Dealer nummer'] || r.dealerNummer || r.DEALER_NUMMER || r.dealer || r.Dealer || '').trim()
          return {
            naam: String(r.naam || r.Naam || r.NAAM || '').trim(),
            dealer_nummer: dealer,
            postcode: String(r.postcode || r.Postcode || r.POSTCODE || '').trim(),
            straat: String(r.straat || r.Straat || r.STRAAT || r.adres || r.Adres || '').trim(),
            huisnummer: String(r.huisnummer || r.Huisnummer || r.HUISNUMMER || r.nr || '').trim() || undefined,
            stad: String(r.stad || r.Stad || r.STAD || '').trim(),
            land: (landVal === 'belgië' || landVal === 'belgie' || landVal === 'belgium') ? 'Belgium' : ((landVal === 'nederland' || landVal === 'netherlands') ? 'Netherlands' : undefined),
            api_type: apiVal === 'wilmar' ? 'wilmar' : (apiVal === 'vendit' ? 'vendit' : (apiVal === 'vendit_api' ? 'vendit_api' : (apiVal === 'cyclesoftware' ? 'cyclesoftware' : undefined))),
          }
        }).filter(r => r.dealer_nummer)
        if (parsed.length === 0) {
          const heeftRijen = rows.length > 0
          setImportError(heeftRijen
            ? 'Geen geldige rijen gevonden. Elke rij moet een dealer_nummer hebben. Kolomnamen: dealer_nummer, Dealer nummer, of DEALER_NUMMER.'
            : 'Geen data gevonden. Zorg dat het bestand een eerste rij met kolomnamen heeft (naam, dealer_nummer, …) en daarna de data.')
        } else {
          setImportData(parsed)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      setImportError(`Kon het bestand niet lezen: ${msg}. Zorg dat het een geldig .xlsx of .xls bestand is.`)
    }
    e.target.value = ''
  }

  async function importeerWinkels() {
    if (importData.length === 0) return
    setImportLoading(true); setImportError(''); setImportSuccess(''); setImportProgress({ current: 0, total: importData.length, toegevoegd: 0, bijgewerkt: 0 })
    let toegevoegd = 0
    let bijgewerkt = 0
    const fouten: string[] = []
    for (let i = 0; i < importData.length; i++) {
      const winkel = importData[i]
      const bestaand = winkels.find(w => String(w.dealer_nummer).trim() === String(winkel.dealer_nummer).trim())
      if (bestaand) {
        const payload = {
          id: bestaand.id,
          naam: (winkel.naam?.trim()) ? winkel.naam.trim() : bestaand.naam,
          dealer_nummer: winkel.dealer_nummer,
          postcode: (winkel.postcode?.trim()) ? winkel.postcode.trim() : bestaand.postcode,
          straat: (winkel.straat?.trim()) ? winkel.straat.trim() : bestaand.straat,
          huisnummer: (winkel.huisnummer?.trim()) ? winkel.huisnummer.trim() : bestaand.huisnummer ?? null,
          stad: (winkel.stad?.trim()) ? winkel.stad.trim() : bestaand.stad,
          land: winkel.land ?? bestaand.land ?? null,
          wilmar_organisation_id: bestaand.wilmar_organisation_id ?? null,
          wilmar_branch_id: bestaand.wilmar_branch_id ?? null,
          wilmar_store_naam: bestaand.wilmar_store_naam ?? null,
          api_type: winkel.api_type ?? bestaand.api_type ?? 'cyclesoftware',
        }
        const res = await fetch('/api/winkels', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          bijgewerkt++
        } else {
          const data = await res.json().catch(() => ({}))
          fouten.push(`Rij ${i + 1} (${winkel.dealer_nummer}): ${data?.error || res.statusText || res.status}`)
        }
      } else {
        if (!winkel.naam?.trim()) {
          fouten.push(`Rij ${i + 1} (${winkel.dealer_nummer}): Naam is verplicht voor nieuwe winkels`)
        } else {
          const res = await fetch('/api/winkels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(winkel),
          })
          if (res.ok) {
            toegevoegd++
          } else {
            const data = await res.json().catch(() => ({}))
            fouten.push(`Rij ${i + 1} (${winkel.dealer_nummer}): ${data?.error || res.statusText || res.status}`)
          }
        }
      }
      setImportProgress({ current: i + 1, total: importData.length, toegevoegd, bijgewerkt })
    }
    setImportLoading(false)
    setImportProgress(null)
    if (fouten.length > 0) {
      setImportError(fouten.length <= 3 ? fouten.join(' · ') : `${fouten.length} fouten: ${fouten.slice(0, 2).join(' · ')} ... en ${fouten.length - 2} meer`)
    }
    const parts = []
    if (toegevoegd > 0) parts.push(`${toegevoegd} toegevoegd`)
    if (bijgewerkt > 0) parts.push(`${bijgewerkt} bijgewerkt`)
    const verversHint = (toegevoegd + bijgewerkt) > 0 ? ' Klik op Ververs om de wijzigingen te zien.' : ''
    setImportSuccess(parts.length > 0 ? `${parts.join(', ')} (${toegevoegd + bijgewerkt} van ${importData.length} winkels).${verversHint}` : `${toegevoegd + bijgewerkt} van ${importData.length} winkels verwerkt.${verversHint}`)
    setImportData([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function importeerMedewerkers() {
    if (importData.length === 0) return
    setImportLoading(true); setImportError(''); setImportSuccess('')
    try {
      const res = await fetch('/api/gebruikers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: importData }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportError(data?.error ?? 'Importeren mislukt')
      } else {
        const { toegevoegd = [], bestaand = [], fouten = [] } = data
        const parts = []
        if (toegevoegd.length > 0) parts.push(`${toegevoegd.length} toegevoegd`)
        if (bestaand.length > 0) parts.push(`${bestaand.length} al bekend`)
        if (fouten.length > 0) setImportError(fouten.slice(0, 3).map((f: { email: string; message: string }) => `${f.email}: ${f.message}`).join(' · ') + (fouten.length > 3 ? ` … en ${fouten.length - 3} meer` : ''))
        setImportSuccess(parts.length > 0 ? `${parts.join(', ')}. Welkomstmail met wachtwoord verstuurd naar nieuwe medewerkers.` : 'Geen nieuwe medewerkers toegevoegd.')
        setImportData([])
        if (fileInputRef.current) fileInputRef.current.value = ''
        await onRefreshGebruikers()
      }
    } catch {
      setImportError('Importeren mislukt')
    }
    setImportLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F, borderTop: `3px solid ${DYNAMO_BLUE}`, paddingTop: '12px', marginTop: '-4px' }}>📊 Importeren via Excel</h2>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,69,124,0.15)' }}>
            <button type="button" onClick={() => { setImportType('winkels'); setImportData([]); setImportError(''); setImportSuccess('') }} className="px-4 py-2 text-xs font-semibold transition" style={importType === 'winkels' ? { background: DYNAMO_BLUE, color: 'white', fontFamily: F } : { background: 'white', color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Winkels</button>
            <button type="button" onClick={() => { setImportType('medewerkers'); setImportData([]); setImportError(''); setImportSuccess('') }} className="px-4 py-2 text-xs font-semibold transition" style={importType === 'medewerkers' ? { background: DYNAMO_BLUE, color: 'white', fontFamily: F } : { background: 'white', color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Medewerkers</button>
          </div>
        </div>
        {importType === 'winkels' ? (
          <p className="text-xs mb-5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>Upload een .xlsx bestand met kolommen: <strong>naam</strong>, <strong>dealer_nummer</strong> (verplicht), <strong>postcode</strong>, <strong>straat</strong>, <strong>huisnummer</strong> (optioneel), <strong>stad</strong>, <strong>land</strong> (optioneel: Nederland of België), <strong>api_type</strong> (optioneel: cyclesoftware, wilmar, vendit of vendit_api). Bestaande winkels met hetzelfde dealer_nummer worden bijgewerkt.</p>
        ) : (
          <p className="text-xs mb-5" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>Upload een .xlsx bestand met kolommen: <strong>email</strong> (verplicht), <strong>naam</strong> (optioneel), <strong>rol</strong> (optioneel: viewer, lunch of admin; standaard viewer). Nieuwe medewerkers krijgen een wachtwoord per e-mail en moeten dit bij eerste inlog wijzigen.</p>
        )}
        <div className="rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition hover:opacity-80" style={{ borderColor: 'rgba(45,69,124,0.15)', background: 'rgba(45,69,124,0.02)' }} onClick={() => fileInputRef.current?.click()}>
          <div className="text-3xl mb-2">📂</div>
          <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Klik om een Excel bestand te kiezen</div>
          <div className="text-xs mt-1" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Ondersteund: .xlsx, .xls</div>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={verwerkExcel} />
        </div>
        {importError && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#dc2626', fontFamily: F }}>{importError}</div>}
        {importSuccess && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#f0fdf4', color: '#16a34a', fontFamily: F }}>✓ {importSuccess}</div>}
        {importProgress && (
          <div className="mt-3 rounded-xl p-4 space-y-2" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
            <div className="flex justify-between text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
              <span>{importProgress.current} van {importProgress.total} verwerkt</span>
              <span style={{ color: 'rgba(45,69,124,0.5)' }}>{importProgress.toegevoegd} toegevoegd · {importProgress.bijgewerkt} bijgewerkt</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(45,69,124,0.06)' }}>
              <div className="h-full transition-all duration-300" style={{ width: `${(importProgress.current / importProgress.total) * 100}%`, background: DYNAMO_BLUE }} />
            </div>
          </div>
        )}
        {importData.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{importData.length} {importType === 'medewerkers' ? 'medewerkers' : 'winkels'} gevonden</span>
              <button onClick={() => { setImportData([]); if (fileInputRef.current) fileInputRef.current.value = '' }} className="text-xs hover:opacity-70" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Wissen</button>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,69,124,0.08)' }}>
              <table className="w-full text-xs">
                <thead style={{ background: DYNAMO_BLUE }}>
                  <tr>{(importType === 'medewerkers' ? ['E-mail', 'Naam', 'Rol'] : ['Naam', 'Dealer #', 'Postcode', 'Straat', 'Nr', 'Stad', 'Land', 'API']).map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: F }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {importType === 'medewerkers'
                    ? importData.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(45,69,124,0.02)', borderBottom: '1px solid rgba(45,69,124,0.05)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.email}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.naam || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.rol || 'viewer'}</td>
                        </tr>
                      ))
                    : importData.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(45,69,124,0.02)', borderBottom: '1px solid rgba(45,69,124,0.05)' }}>
                          <td className="px-3 py-2 font-medium" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.naam}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.dealer_nummer}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.postcode || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.straat || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.huisnummer || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.stad || '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.land ? (r.land === 'Belgium' ? 'België' : 'Nederland') : '—'}</td>
                          <td className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>{r.api_type || '—'}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {importData.length > 10 && <div className="px-3 py-2 text-xs text-center" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>+ {importData.length - 10} meer rijen</div>}
            </div>
            <button onClick={importType === 'medewerkers' ? importeerMedewerkers : importeerWinkels} disabled={importLoading} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 transition hover:opacity-90" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
              {importLoading && importProgress
                ? `Importeren... ${importProgress.current} van ${importProgress.total}`
                : importLoading
                  ? 'Importeren...'
                  : importType === 'medewerkers'
                    ? `${importData.length} medewerkers importeren`
                    : `${importData.length} winkels importeren`}
            </button>
          </div>
        )}
      </div>
      <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(45,69,124,0.07)', boxShadow: '0 2px 8px rgba(45,69,124,0.04)' }}>
        <h3 className="text-xs font-bold uppercase mb-3" style={{ color: 'rgba(45,69,124,0.4)', letterSpacing: '0.1em', fontFamily: F }}>Verwacht formaat {importType === 'medewerkers' ? '(medewerkers)' : '(winkels)'}</h3>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,69,124,0.08)' }}>
          <table className="w-full text-xs">
            <thead style={{ background: DYNAMO_BLUE }}>
              <tr>{(importType === 'medewerkers' ? ['email', 'naam', 'rol'] : ['naam', 'dealer_nummer', 'postcode', 'straat', 'huisnummer', 'stad', 'land', 'api_type']).map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(importType === 'medewerkers'
                ? [
                    ['jan@bedrijf.nl', 'Jan Jansen', 'viewer'],
                    ['marie@bedrijf.nl', 'Marie de Vries', 'lunch'],
                    ['admin@bedrijf.nl', 'Beheerder', 'admin'],
                  ]
                : [
                    ['Dynamo Amsterdam','10001','1012AB','Damrak','1','Amsterdam','Nederland','cyclesoftware'],
                    ['Dynamo Rotterdam','10002','3011AD','Coolsingel','42','Rotterdam','Nederland','cyclesoftware'],
                    ['Dynamo Brussel','10003','1000','Nieuwstraat','1','Brussel','België','wilmar'],
                  ]
              ).map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(45,69,124,0.02)', borderBottom: '1px solid rgba(45,69,124,0.05)' }}>
                  {r.map((c, j) => <td key={j} className="px-3 py-2" style={{ color: 'rgba(45,69,124,0.7)', fontFamily: F }}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
