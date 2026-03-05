'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const DYNAMO_BLUE = '#0d1f4e'
const DYNAMO_GOLD = '#f0c040'
const F = "'Outfit', sans-serif"
const BIKE_TOTAAL_LOGO = '/bike-totaal-logo.png'
const WINKEL_KLEUREN = ['#2563eb','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#65a30d','#db2777']
function isBikeTotaal(naam: string) { return /bike\s*totaal/i.test(naam) }

type Rol = { id: number; user_id: string; rol: string; naam: string; mfa_verplicht?: boolean; created_at: string }
type WinkelToegang = { id: number; user_id: string; winkel_id: number }
type Winkel = {
  id: number
  naam: string
  dealer_nummer: string
  postcode?: string
  straat?: string
  stad?: string
  land?: 'Netherlands' | 'Belgium' | null
  lat?: number
  lng?: number
  wilmar_organisation_id?: number
  wilmar_branch_id?: number
  wilmar_store_naam?: string
  api_type?: 'cyclesoftware' | 'wilmar' | null
  cycle_api_authorized?: boolean | null
  cycle_api_checked_at?: string | null
}
type Tab = 'gebruikers' | 'winkels' | 'import' | 'ips'

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
)

export default function BeheerPage() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('winkels')
  const [rollen, setRollen] = useState<Rol[]>([])
  const [winkelToegang, setWinkelToegang] = useState<WinkelToegang[]>([])
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toonForm, setToonForm] = useState(false)
  const [bewerkGebruiker, setBewerkGebruiker] = useState<Rol | null>(null)
  const [bewerkEmail, setBewerkEmail] = useState('')
  const [bewerkWinkel, setBewerkWinkel] = useState<Winkel | null>(null)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [winkelLoading, setWinkelLoading] = useState(false)

  // Nieuw gebruiker
  const [nieuwEmail, setNieuwEmail] = useState('')
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwRol, setNieuwRol] = useState('viewer')
  const [nieuwMfaVerplicht, setNieuwMfaVerplicht] = useState(false)
  const [geselecteerdeWinkels, setGeselecteerdeWinkels] = useState<number[]>([])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Nieuw winkel form
  const [nieuwWinkelNaam, setNieuwWinkelNaam] = useState('')
  const [nieuwWinkelDealer, setNieuwWinkelDealer] = useState('')
  const [nieuwWinkelPostcode, setNieuwWinkelPostcode] = useState('')
  const [nieuwWinkelHuisnummer, setNieuwWinkelHuisnummer] = useState('')
  const [nieuwWinkelStad, setNieuwWinkelStad] = useState('')
  const [nieuwWinkelStraat, setNieuwWinkelStraat] = useState('')
  const [nieuwWinkelApiType, setNieuwWinkelApiType] = useState<'cyclesoftware' | 'wilmar'>('cyclesoftware')
  const [nieuwWinkelLand, setNieuwWinkelLand] = useState<'Netherlands' | 'Belgium' | ''>('')
  const [adresLoading, setAdresLoading] = useState(false)
  const [bewerkHuisnummer, setBewerkHuisnummer] = useState('')

  // Wilmar — aparte state los van bewerkWinkel
  const [wilmarStores, setWilmarStores] = useState<any[]>([])
  const [wilmarStoresLoading, setWilmarStoresLoading] = useState(false)
  const [wilmarBranchId, setWilmarBranchId] = useState<number | null>(null)
  const [wilmarOrganisationId, setWilmarOrganisationId] = useState<number | null>(null)
  const [wilmarZoekterm, setWilmarZoekterm] = useState('')
  const [wilmarAutoLinkLoading, setWilmarAutoLinkLoading] = useState(false)

  // Excel import
  const [importData, setImportData] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; toegevoegd: number; bijgewerkt: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cycleStatusLoading, setCycleStatusLoading] = useState(false)
  const [mfaStatus, setMfaStatus] = useState<Record<string, boolean>>({})
  const [userEmails, setUserEmails] = useState<Record<string, string>>({})

  // Vertrouwde IP's (alleen admin)
  const [trustedIps, setTrustedIps] = useState<{ id: number; ip_or_cidr: string; created_at: string }[]>([])
  const [nieuwIp, setNieuwIp] = useState('')
  const [ipLoading, setIpLoading] = useState(false)
  const [ipError, setIpError] = useState('')

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  // Winkel filters
  const [winkelFilterSysteem, setWinkelFilterSysteem] = useState<'alle' | 'cyclesoftware' | 'wilmar'>('alle')
  const [winkelFilterApi, setWinkelFilterApi] = useState<'alle' | 'ok' | 'geen' | 'niet_gecontroleerd' | 'gekoppeld' | 'niet_gekoppeld'>('alle')
  const [winkelFilterLand, setWinkelFilterLand] = useState<'alle' | 'Netherlands' | 'Belgium'>('alle')
  const [winkelFilterLocatie, setWinkelFilterLocatie] = useState<'alle' | 'zonder'>('alle')
  const [winkelZoekterm, setWinkelZoekterm] = useState('')

  const haalGebruikersOp = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/gebruikers')
    if (res.status === 403) {
      setError('Geen toegang. Alleen admins.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRollen(data.rollen ?? [])
    setWinkelToegang(data.winkelToegang ?? [])
    setWinkels(data.winkels ?? [])
    setMfaStatus(data.mfaStatus ?? {})
    setUserEmails(data.userEmails ?? {})
    setLoading(false)
  }, [])

  const haalWinkelsOp = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await fetch('/api/winkels')
    if (!res.ok) {
      setError('Kon winkels niet laden.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setWinkels(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (searchParams.get('locatie') === 'zonder') {
      setTab('winkels')
      setWinkelFilterLocatie('zonder')
    }
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({}))
      const admin = info.isAdmin === true
      if (cancelled) return
      setIsAdmin(admin)
      if (admin) {
        await haalGebruikersOp()
      } else {
        await haalWinkelsOp()
      }
    }
    init()
    return () => { cancelled = true }
  }, [haalGebruikersOp, haalWinkelsOp])

  const haalTrustedIpsOp = useCallback(async () => {
    const res = await fetch('/api/trusted-ips')
    if (res.ok) {
      const data = await res.json()
      setTrustedIps(Array.isArray(data) ? data : [])
    } else {
      setTrustedIps([])
    }
  }, [])

  useEffect(() => {
    if (isAdmin === true) haalTrustedIpsOp()
  }, [isAdmin, haalTrustedIpsOp])

  async function voegTrustedIpToe(e: React.FormEvent) {
    e.preventDefault()
    const ip = nieuwIp.trim()
    if (!ip) return
    setIpLoading(true)
    setIpError('')
    try {
      const res = await fetch('/api/trusted-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_or_cidr: ip }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Fout: ${res.status}`)
      setNieuwIp('')
      haalTrustedIpsOp()
    } catch (err: unknown) {
      setIpError(err instanceof Error ? err.message : 'Toevoegen mislukt')
    }
    setIpLoading(false)
  }

  async function verwijderTrustedIp(id: number) {
    if (!confirm('Dit IP-adres verwijderen?')) return
    const res = await fetch(`/api/trusted-ips?id=${id}`, { method: 'DELETE' })
    if (res.ok) haalTrustedIpsOp()
  }

  async function verversCycleApiStatus() {
    const cycleWinkels = gefilterdeWinkels.filter(w =>
      (w.api_type === 'cyclesoftware' || (!w.api_type && !w.wilmar_organisation_id && !w.wilmar_branch_id)) &&
      w.dealer_nummer?.trim()
    )
    if (cycleWinkels.length === 0) return
    setCycleStatusLoading(true)
    try {
      const res = await fetch('/api/voorraad/status/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cycleWinkels.map(w => ({ id: w.id, dealer_nummer: w.dealer_nummer })) }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.results) {
        setWinkels(prev => prev.map(w => {
          const r = data.results[w.id]
          if (!r) return w
          return { ...w, cycle_api_authorized: r.authorized, cycle_api_checked_at: new Date().toISOString() }
        }))
      }
    } finally {
      setCycleStatusLoading(false)
    }
  }

  async function haalWilmarStoresOp() {
    setWilmarStoresLoading(true)
    setWilmarZoekterm('')
    try {
      const res = await fetch('/api/wilmar?action=stores')
      const data = await res.json()
      setWilmarStores(Array.isArray(data) ? data : [])
    } catch {
      setWilmarStores([])
    }
    setWilmarStoresLoading(false)
  }

  async function haalAdresOp(isNieuw: boolean) {
    const postcode = isNieuw ? nieuwWinkelPostcode : (bewerkWinkel?.postcode ?? '')
    const huisnummer = isNieuw ? nieuwWinkelHuisnummer : bewerkHuisnummer
    if (!postcode.trim() || !huisnummer.trim()) {
      setFormError('Vul postcode en huisnummer in om het adres op te halen.')
      return
    }
    setAdresLoading(true)
    setFormError('')
    try {
      const res = await fetch(`/api/adres?postcode=${encodeURIComponent(postcode.replace(/\s/g, ''))}&huisnummer=${encodeURIComponent(huisnummer)}`)
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Adres niet gevonden.')
        return
      }
      if (isNieuw) {
        setNieuwWinkelStad(data.stad ?? '')
        setNieuwWinkelStraat(data.straat ?? '')
        if (data.postcode) setNieuwWinkelPostcode(data.postcode)
      } else if (bewerkWinkel) {
        setBewerkWinkel({
          ...bewerkWinkel,
          stad: data.stad ?? bewerkWinkel.stad,
          straat: data.straat ?? bewerkWinkel.straat,
          postcode: data.postcode ?? bewerkWinkel.postcode,
          lat: data.lat ?? bewerkWinkel.lat,
          lng: data.lng ?? bewerkWinkel.lng,
        })
      }
    } catch {
      setFormError('Kon adres niet ophalen.')
    }
    setAdresLoading(false)
  }

  function startWinkelBewerken(w: Winkel) {
    setBewerkWinkel(w)
    setToonWinkelForm(false)
    setWilmarBranchId(w.wilmar_branch_id ?? null)
    setWilmarOrganisationId(w.wilmar_organisation_id ?? null)
    setWilmarStores([])
    setWilmarZoekterm('')
    setBewerkHuisnummer('')
    setFormError('')
    setFormSuccess('')
  }

  async function voegGebruikerToe(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true); setFormError(''); setFormSuccess('')
    const res = await fetch('/api/gebruikers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nieuwEmail, naam: nieuwNaam, rol: nieuwRol, mfa_verplicht: nieuwMfaVerplicht, winkel_ids: geselecteerdeWinkels }),
    })
    const data = await res.json()
    setFormLoading(false)
    if (!res.ok) { setFormError(data.error ?? 'Er ging iets mis') }
    else {
      setFormSuccess(`Uitnodiging verstuurd naar ${nieuwEmail}!`)
      setNieuwEmail(''); setNieuwNaam(''); setNieuwRol('viewer'); setNieuwMfaVerplicht(false); setGeselecteerdeWinkels([])
      setToonForm(false)
      await haalGebruikersOp()
    }
  }

  async function updateGebruiker(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkGebruiker) return
    setFormLoading(true)
    setFormError('')
    const origEmail = userEmails[bewerkGebruiker.user_id] ?? ''
    const newEmail = bewerkEmail.trim()
    const emailChanged = newEmail && newEmail !== origEmail
    const res = await fetch('/api/gebruikers/rollen', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: bewerkGebruiker.user_id, rol: bewerkGebruiker.rol, naam: bewerkGebruiker.naam, email: emailChanged ? newEmail : undefined, mfa_verplicht: bewerkGebruiker.mfa_verplicht ?? false, winkel_ids: geselecteerdeWinkels }),
    })
    const data = await res.json().catch(() => ({}))
    setFormLoading(false)
    if (res.ok) {
      setBewerkGebruiker(null)
      setBewerkEmail('')
      setGeselecteerdeWinkels([])
      setFormSuccess('Gebruiker opgeslagen.')
      await haalGebruikersOp()
    } else {
      setFormError(data.error ?? 'Opslaan mislukt.')
    }
  }

  async function verwijderGebruiker(userId: string, naam: string) {
    if (!confirm(`Gebruiker "${naam}" verwijderen?`)) return
    await fetch(`/api/gebruikers?user_id=${userId}`, { method: 'DELETE' })
    await haalGebruikersOp()
  }

  async function voegWinkelToe(e: React.FormEvent) {
    e.preventDefault()
    setWinkelLoading(true)
    await fetch('/api/winkels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        naam: nieuwWinkelNaam,
        dealer_nummer: nieuwWinkelDealer,
        postcode: nieuwWinkelPostcode,
        straat: nieuwWinkelStraat || undefined,
        stad: nieuwWinkelStad,
        land: nieuwWinkelLand || undefined,
        api_type: nieuwWinkelApiType,
      }),
    })
    setNieuwWinkelNaam('')
    setNieuwWinkelDealer('')
    setNieuwWinkelPostcode('')
    setNieuwWinkelHuisnummer('')
    setNieuwWinkelStad('')
    setNieuwWinkelStraat('')
    setNieuwWinkelLand('')
    setNieuwWinkelApiType('cyclesoftware')
    setToonWinkelForm(false); setWinkelLoading(false)
    await haalGebruikersOp()
  }

  async function slaWinkelOp(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkWinkel) return
    setWinkelLoading(true)
    setFormError('')
    setFormSuccess('')
    const heeftWilmarKoppeling = wilmarBranchId != null && wilmarOrganisationId != null
    const geselecteerdeWilmarStore = wilmarStores.find(
      s => s.organisationId === wilmarOrganisationId && s.branchId === wilmarBranchId
    )
    const wilmarNaam = geselecteerdeWilmarStore?.name
      ? `${geselecteerdeWilmarStore.name}${geselecteerdeWilmarStore.city ? ` (${geselecteerdeWilmarStore.city})` : ''}`
      : null
    const payload = {
      id: bewerkWinkel.id,
      naam: bewerkWinkel.naam,
      dealer_nummer: bewerkWinkel.dealer_nummer,
      postcode: bewerkWinkel.postcode,
      straat: bewerkWinkel.straat,
      stad: bewerkWinkel.stad,
      land: bewerkWinkel.land ?? null,
      wilmar_organisation_id: wilmarOrganisationId ?? null,
      wilmar_branch_id: wilmarBranchId ?? null,
      wilmar_store_naam: heeftWilmarKoppeling ? (wilmarNaam ?? bewerkWinkel.wilmar_store_naam ?? null) : null,
      api_type: heeftWilmarKoppeling ? 'wilmar' : 'cyclesoftware',
    }
    const res = await fetch('/api/winkels', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    setWinkelLoading(false)
    if (!res.ok) {
      setFormError(data.error ?? data.message ?? 'Opslaan mislukt. Probeer het opnieuw.')
      return
    }
    setFormSuccess(`${bewerkWinkel.naam} opgeslagen.`)
    setBewerkWinkel(null)
    setWilmarBranchId(null)
    setWilmarOrganisationId(null)
    await haalGebruikersOp()
  }

  async function verwijderWinkel(id: number, naam: string) {
    if (!confirm(`Winkel "${naam}" verwijderen?`)) return
    await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })
    await haalGebruikersOp()
  }

  function toggleWinkel(id: number) {
    setGeselecteerdeWinkels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function startBewerken(rol: Rol) {
    setBewerkGebruiker(rol)
    setBewerkEmail(userEmails[rol.user_id] ?? '')
    setToonForm(false)
    setGeselecteerdeWinkels(winkelToegang.filter(wt => wt.user_id === rol.user_id).map(wt => wt.winkel_id))
  }

  function winkelNamenVoorGebruiker(userId: string) {
    const uitgeslotenIds = winkelToegang.filter(wt => wt.user_id === userId).map(wt => wt.winkel_id)
    if (uitgeslotenIds.length === 0) return 'Alle winkels'
    const toegankelijk = winkels.filter(w => !uitgeslotenIds.includes(w.id))
    return toegankelijk.length === 0 ? 'Geen winkels' : toegankelijk.map(w => w.naam).join(', ')
  }

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
      const parsed = rows.map(r => {
        const apiVal = String(r.api_type || r['API type'] || r.apiType || '').trim().toLowerCase()
        const landVal = String(r.land || r.Land || r.LAND || '').trim().toLowerCase()
        const dealer = String(r.dealer_nummer || r['Dealer nummer'] || r.dealerNummer || r.DEALER_NUMMER || r.dealer || r.Dealer || '').trim()
        return {
          naam: String(r.naam || r.Naam || r.NAAM || '').trim(),
          dealer_nummer: dealer,
          postcode: String(r.postcode || r.Postcode || r.POSTCODE || '').trim(),
          straat: String(r.straat || r.Straat || r.STRAAT || r.adres || r.Adres || '').trim(),
          stad: String(r.stad || r.Stad || r.STAD || '').trim(),
          land: (landVal === 'belgië' || landVal === 'belgie' || landVal === 'belgium') ? 'Belgium' : ((landVal === 'nederland' || landVal === 'netherlands') ? 'Netherlands' : undefined),
          api_type: apiVal === 'wilmar' ? 'wilmar' : (apiVal === 'cyclesoftware' ? 'cyclesoftware' : undefined),
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      setImportError(`Kon het bestand niet lezen: ${msg}. Zorg dat het een geldig .xlsx of .xls bestand is.`)
    }
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
    setImportSuccess(parts.length > 0 ? `${parts.join(', ')} (${toegevoegd + bijgewerkt} van ${importData.length} winkels)` : `${toegevoegd + bijgewerkt} van ${importData.length} winkels verwerkt`)
    setImportData([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    await haalGebruikersOp()
  }

  async function wilmarAutoKoppelen() {
    setWilmarAutoLinkLoading(true)
    setError('')
    setFormSuccess('')
    try {
      const res = await fetch('/api/winkels/wilmar-auto-link', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Fout: ${res.status}`)
      const n = data.gekoppeld ?? 0
      setFormSuccess(n > 0 ? `${n} winkels automatisch gekoppeld aan Wilmar` : 'Geen nieuwe koppelingen gevonden')
      await haalGebruikersOp()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Auto-koppelen mislukt')
    }
    setWilmarAutoLinkLoading(false)
  }

  const gefilterdeWilmarStores = useMemo(() => {
    const zoek = wilmarZoekterm.trim().toLowerCase()
    if (!zoek) return wilmarStores
    return wilmarStores.filter(s => {
      const naam = String(s.name ?? '').toLowerCase()
      const stad = String(s.city ?? '').toLowerCase()
      return naam.includes(zoek) || stad.includes(zoek)
    })
  }, [wilmarStores, wilmarZoekterm])

  const gefilterdeWinkels = useMemo(() => {
    const zoek = winkelZoekterm.trim().toLowerCase()
    return winkels.filter(w => {
      const isWilmar = w.api_type === 'wilmar' || (w.wilmar_organisation_id != null && w.wilmar_branch_id != null)
      const isCycle = !isWilmar
      if (winkelFilterSysteem === 'cyclesoftware' && isWilmar) return false
      if (winkelFilterSysteem === 'wilmar' && isCycle) return false
      if (winkelFilterLand !== 'alle' && w.land !== winkelFilterLand) return false
      if (winkelFilterLocatie === 'zonder' && (w.lat != null || w.lng != null)) return false
      if (winkelFilterApi !== 'alle') {
        if (winkelFilterSysteem === 'wilmar') {
          if (winkelFilterApi === 'gekoppeld') return isWilmar && w.wilmar_organisation_id != null && w.wilmar_branch_id != null
          if (winkelFilterApi === 'niet_gekoppeld') return isWilmar && (w.wilmar_organisation_id == null || w.wilmar_branch_id == null)
        } else {
          if (winkelFilterApi === 'ok') return isCycle && w.cycle_api_authorized === true
          if (winkelFilterApi === 'geen') return isCycle && w.cycle_api_authorized === false
          if (winkelFilterApi === 'niet_gecontroleerd') return w.cycle_api_authorized == null
        }
      }
      if (zoek) {
        const naam = String(w.naam ?? '').toLowerCase()
        const stad = String(w.stad ?? '').toLowerCase()
        const dealer = String(w.dealer_nummer ?? '').toLowerCase()
        const straat = String(w.straat ?? '').toLowerCase()
        const postcode = String(w.postcode ?? '').toLowerCase()
        const wilmarNaam = String(w.wilmar_store_naam ?? '').toLowerCase()
        if (!naam.includes(zoek) && !stad.includes(zoek) && !dealer.includes(zoek) && !straat.includes(zoek) && !postcode.includes(zoek) && !wilmarNaam.includes(zoek)) return false
      }
      return true
    })
  }, [winkels, winkelFilterSysteem, winkelFilterApi, winkelFilterLand, winkelFilterLocatie, winkelZoekterm])

  const inputStyle = { background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }
  const inputClass = "w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400"

  const tabs: { key: Tab; label: string; icon: string; count?: number }[] = isAdmin
    ? [
        { key: 'winkels', label: 'Winkels', icon: '🏪', count: winkels.length },
        { key: 'gebruikers', label: 'Gebruikers', icon: '👤', count: rollen.length },
        ...(!error ? [{ key: 'ips' as Tab, label: 'Vertrouwde IP\'s', icon: '🔒', count: trustedIps.length }] : []),
        { key: 'import', label: 'Excel Import', icon: '📊' },
      ]
    : [{ key: 'winkels', label: 'Winkels', icon: '🏪', count: winkels.length }]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f4f6fb', fontFamily: F }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');`}</style>

      <header style={{ background: DYNAMO_BLUE }} className="sticky top-0 z-[100]">
        <div className="px-3 sm:px-5 flex flex-wrap items-stretch gap-2 sm:gap-0 py-2 sm:py-0" style={{ minHeight: '56px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3 pr-3 sm:pr-6 shrink-0 hover:opacity-90 transition" style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-black shrink-0" style={{ background: DYNAMO_GOLD }}>
              <span style={{ color: DYNAMO_BLUE, fontFamily: F, fontWeight: 800, fontSize: '13px' }} className="sm:text-[15px]">D</span>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs sm:text-sm text-white leading-tight truncate" style={{ letterSpacing: '0.06em', fontFamily: F }}>DYNAMO</div>
              <div className="text-[10px] sm:text-xs font-semibold leading-tight truncate" style={{ color: DYNAMO_GOLD, letterSpacing: '0.12em', fontFamily: F }}>RETAIL GROUP</div>
            </div>
          </Link>
          <div className="flex items-center px-3 sm:px-5">
            <span className="text-xs sm:text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: F }}>Beheer</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-5 shrink-0">
            <Link href="/dashboard" className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: F }}>
              <IconArrowLeft /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5 max-w-5xl mx-auto w-full space-y-4 sm:space-y-5 overflow-x-hidden">

        <div className="relative rounded-2xl overflow-hidden" style={{ background: DYNAMO_BLUE, minHeight: 120 }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 80% 50%, rgba(240,192,64,0.1) 0%, transparent 60%)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: DYNAMO_GOLD }} />
          <div className="relative p-4 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <h1 style={{ fontFamily: F, color: 'white', fontSize: 'clamp(20px,4vw,24px)', fontWeight: 700, letterSpacing: '-0.02em' }}>Beheer</h1>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px', marginTop: '4px', fontFamily: F }} className="hidden sm:block">{isAdmin ? 'Beheer gebruikers, winkels en importeer data via Excel' : 'Bekijk winkels en API-status'}</p>
            </div>
            <div className="flex items-center gap-4 sm:gap-3 shrink-0">
              {isAdmin && (
                <>
                  <div className="text-center px-4">
                    <div style={{ color: DYNAMO_GOLD, fontSize: '22px', fontWeight: 700, fontFamily: F, lineHeight: 1 }}>{rollen.length}</div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Gebruikers</div>
                  </div>
                  <div style={{ width: '1px', height: '32px', background: 'rgba(255,255,255,0.1)' }} />
                </>
              )}
              <div className="text-center px-4">
                <div style={{ color: 'white', fontSize: '22px', fontWeight: 700, fontFamily: F, lineHeight: 1 }}>{winkels.length}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Winkels</div>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>{error}</div>}
        {formError && <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>{formError}</div>}
        {formSuccess && <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.2)', color: '#16a34a', fontFamily: F }}>✓ {formSuccess}</div>}

        <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)', WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setToonForm(false); setBewerkGebruiker(null); setToonWinkelForm(false); setBewerkWinkel(null) }}
              className="flex-1 min-w-[100px] sm:min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl py-2.5 text-xs sm:text-sm font-semibold transition-all shrink-0"
              style={tab === t.key ? { background: DYNAMO_BLUE, color: 'white', fontFamily: F } : { color: 'rgba(13,31,78,0.5)', fontFamily: F }}>
              <span>{t.icon}</span><span>{t.label}</span>
              {t.count !== undefined && (
                <span className="rounded-full px-1.5 py-0.5 text-xs font-bold" style={tab === t.key ? { background: 'rgba(255,255,255,0.15)', color: 'white' } : { background: 'rgba(13,31,78,0.07)', color: 'rgba(13,31,78,0.5)' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: GEBRUIKERS ── */}
        {tab === 'gebruikers' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setToonForm(v => !v); setBewerkGebruiker(null); setGeselecteerdeWinkels([]) }} className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                + Gebruiker uitnodigen
              </button>
            </div>

            {toonForm && (
              <div className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: `2px solid ${DYNAMO_GOLD}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe gebruiker uitnodigen</h2>
                <form onSubmit={voegGebruikerToe} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>E-mailadres *</label>
                      <input type="email" placeholder="naam@bedrijf.nl" value={nieuwEmail} onChange={e => setNieuwEmail(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam</label>
                      <input type="text" placeholder="Volledige naam" value={nieuwNaam} onChange={e => setNieuwNaam(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Rol</label>
                    <div className="flex gap-3">
                      {[{ value: 'viewer', label: 'Viewer', info: 'Kan voorraad bekijken' }, { value: 'admin', label: 'Admin', info: 'Volledige toegang' }].map(r => (
                        <label key={r.value} className="flex-1 cursor-pointer">
                          <input type="radio" name="rol" value={r.value} checked={nieuwRol === r.value} onChange={() => setNieuwRol(r.value)} className="sr-only" />
                          <div className="rounded-xl border-2 p-3 transition" style={nieuwRol === r.value ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' } : { borderColor: 'rgba(13,31,78,0.1)' }}>
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.label}</div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.45)', fontFamily: F }}>{r.info}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="nieuw_mfa_verplicht" checked={nieuwMfaVerplicht} onChange={e => setNieuwMfaVerplicht(e.target.checked)} className="accent-blue-600" />
                    <label htmlFor="nieuw_mfa_verplicht" className="text-xs font-semibold cursor-pointer" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>MFA verplicht voor deze gebruiker</label>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Winkeltoegang <span style={{ fontWeight: 400, opacity: 0.6 }}>(standaard alle; vink uit om te beperken)</span></label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {winkels.map(w => (
                        <label key={w.id} className="flex items-center gap-2 cursor-pointer rounded-xl border p-2.5 transition" style={!geselecteerdeWinkels.includes(w.id) ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' } : { borderColor: 'rgba(13,31,78,0.1)' }}>
                          <input type="checkbox" checked={!geselecteerdeWinkels.includes(w.id)} onChange={() => toggleWinkel(w.id)} className="accent-blue-600" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</div>
                            <div className="text-xs" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>#{w.dealer_nummer}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{formLoading ? 'Versturen...' : 'Uitnodiging versturen'}</button>
                    <button type="button" onClick={() => setToonForm(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            {bewerkGebruiker && (
              <div className="rounded-2xl p-5 space-y-4" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>✏️ {bewerkGebruiker.naam} bewerken</h2>
                <form onSubmit={updateGebruiker} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam</label>
                      <input type="text" value={bewerkGebruiker.naam} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, naam: e.target.value })} className={inputClass} style={inputStyle} placeholder="Volledige naam" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>E-mailadres</label>
                      <input type="email" value={bewerkEmail} onChange={e => setBewerkEmail(e.target.value)} className={inputClass} style={inputStyle} placeholder="naam@bedrijf.nl" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Rol</label>
                      <select value={bewerkGebruiker.rol} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, rol: e.target.value })} className={inputClass} style={inputStyle}>
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input type="checkbox" id="mfa_verplicht" checked={bewerkGebruiker.mfa_verplicht ?? false} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, mfa_verplicht: e.target.checked })} className="accent-blue-600" />
                      <label htmlFor="mfa_verplicht" className="text-xs font-semibold cursor-pointer" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>MFA verplicht voor deze gebruiker</label>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Winkeltoegang <span style={{ fontWeight: 400, opacity: 0.6 }}>(standaard alle; vink uit om te beperken)</span></label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {winkels.map(w => (
                        <label key={w.id} className="flex items-center gap-2 cursor-pointer rounded-xl border p-2.5 transition" style={!geselecteerdeWinkels.includes(w.id) ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' } : { borderColor: 'rgba(13,31,78,0.1)' }}>
                          <input type="checkbox" checked={!geselecteerdeWinkels.includes(w.id)} onChange={() => toggleWinkel(w.id)} className="accent-blue-600" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</div>
                            <div className="text-xs" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>#{w.dealer_nummer}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{formLoading ? 'Opslaan...' : 'Opslaan'}</button>
                    <button type="button" onClick={() => { setBewerkGebruiker(null); setBewerkEmail(''); setGeselecteerdeWinkels([]) }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <div className="p-4" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Gebruikersoverzicht</div>
                <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{rollen.length} gebruikers</div>
              </div>
              {loading ? (
                <div className="p-10 text-center"><div className="w-7 h-7 border-2 border-gray-200 rounded-full animate-spin mx-auto mb-2" style={{ borderTopColor: DYNAMO_BLUE }} /></div>
              ) : rollen.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>Nog geen gebruikers</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(13,31,78,0.06)' }}>
                  {rollen.map(rol => (
                    <div key={rol.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50/50">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                        {(rol.naam || 'G').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{rol.naam || '(Geen naam)'}</span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={rol.rol === 'admin' ? { background: 'rgba(240,192,64,0.15)', color: '#92660a' } : { background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.6)' }}>
                            {rol.rol === 'admin' ? '👑 Admin' : '👁 Viewer'}
                          </span>
                          {mfaStatus[rol.user_id] === true && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.12)', color: '#15803d' }} title="MFA ingeschakeld">✓ MFA</span>
                          )}
                          {mfaStatus[rol.user_id] === false && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.45)' }} title="MFA uitgeschakeld">— MFA</span>
                          )}
                          {rol.mfa_verplicht && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: '#b91c1c' }} title="MFA verplicht">MFA verplicht</span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{userEmails[rol.user_id] || '(Geen e-mail)'}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>{winkelNamenVoorGebruiker(rol.user_id)}</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => startBewerken(rol)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(13,31,78,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Bewerken</button>
                        <button onClick={() => verwijderGebruiker(rol.user_id, rol.naam)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: WINKELS ── */}
        {tab === 'winkels' && (
          <div className="space-y-4">
            {isAdmin && (
              <div className="flex justify-end">
                <button onClick={() => { setToonWinkelForm(v => !v); setBewerkWinkel(null) }} className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                  + Winkel toevoegen
                </button>
              </div>
            )}

            {isAdmin && toonWinkelForm && (
              <div className="rounded-2xl p-5" style={{ background: 'white', border: `2px solid ${DYNAMO_GOLD}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Nieuwe winkel</h2>
                <form onSubmit={voegWinkelToe} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam *</label>
                      <input placeholder="Winkel naam" value={nieuwWinkelNaam} onChange={e => setNieuwWinkelNaam(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Dealer nummer *</label>
                      <input placeholder="bijv. 12345" value={nieuwWinkelDealer} onChange={e => setNieuwWinkelDealer(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-semibold mb-1" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Adres (optioneel — vul postcode + huisnummer in en klik op Haal adres op)</div>
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[100px]">
                          <input placeholder="Postcode (1234AB)" value={nieuwWinkelPostcode} onChange={e => setNieuwWinkelPostcode(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <div className="w-24">
                          <input placeholder="Nr." value={nieuwWinkelHuisnummer} onChange={e => setNieuwWinkelHuisnummer(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <button type="button" onClick={() => haalAdresOp(true)} disabled={adresLoading} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50" style={{ background: 'rgba(13,31,78,0.08)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.12)', fontFamily: F }}>
                          {adresLoading ? 'Bezig...' : 'Haal adres op'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Straat</label>
                      <input placeholder="Straat + huisnummer" value={nieuwWinkelStraat} onChange={e => setNieuwWinkelStraat(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Stad</label>
                      <input placeholder="bijv. Amsterdam" value={nieuwWinkelStad} onChange={e => setNieuwWinkelStad(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Land</label>
                      <select value={nieuwWinkelLand} onChange={e => setNieuwWinkelLand(e.target.value as 'Netherlands' | 'Belgium' | '')} className={inputClass} style={inputStyle}>
                        <option value="">— Niet gekozen</option>
                        <option value="Netherlands">🇳🇱 Nederland</option>
                        <option value="Belgium">🇧🇪 België</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>
                      Systeem
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { value: 'cyclesoftware', label: 'CycleSoftware', info: 'Standaard koppeling via dealer nummer' },
                        { value: 'wilmar', label: 'Wilmar', info: 'Gebruik Wilmar API met branch koppeling' },
                      ].map(opt => (
                        <label key={opt.value} className="flex-1 min-w-[140px] cursor-pointer">
                          <input
                            type="radio"
                            name="winkel_api_type"
                            value={opt.value}
                            checked={nieuwWinkelApiType === opt.value}
                            onChange={() =>
                              setNieuwWinkelApiType(opt.value as 'cyclesoftware' | 'wilmar')
                            }
                            className="sr-only"
                          />
                          <div
                            className="rounded-xl border-2 p-3 transition"
                            style={
                              nieuwWinkelApiType === opt.value
                                ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' }
                                : { borderColor: 'rgba(13,31,78,0.1)' }
                            }
                          >
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                              {opt.label}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.45)', fontFamily: F }}>
                              {opt.info}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={winkelLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{winkelLoading ? 'Bezig...' : 'Toevoegen'}</button>
                    <button type="button" onClick={() => { setToonWinkelForm(false); setFormError('') }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            {isAdmin && bewerkWinkel && (
              <div className="rounded-2xl p-5" style={{ background: 'white', border: `2px solid ${DYNAMO_BLUE}`, boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: DYNAMO_BLUE, fontFamily: F }}>✏️ {bewerkWinkel.naam} bewerken</h2>
                <form onSubmit={slaWinkelOp} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Naam *</label>
                      <input value={bewerkWinkel.naam} onChange={e => setBewerkWinkel({ ...bewerkWinkel, naam: e.target.value })} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Dealer nummer *</label>
                      <input value={bewerkWinkel.dealer_nummer} onChange={e => setBewerkWinkel({ ...bewerkWinkel, dealer_nummer: e.target.value })} className={inputClass} style={inputStyle} required />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-semibold mb-1" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Adres (postcode + huisnummer → Haal adres op)</div>
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[100px]">
                          <input placeholder="Postcode" value={bewerkWinkel.postcode ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, postcode: e.target.value })} className={inputClass} style={inputStyle} />
                        </div>
                        <div className="w-24">
                          <input placeholder="Nr." value={bewerkHuisnummer} onChange={e => setBewerkHuisnummer(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <button type="button" onClick={() => haalAdresOp(false)} disabled={adresLoading} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50" style={{ background: 'rgba(13,31,78,0.08)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.12)', fontFamily: F }}>
                          {adresLoading ? 'Bezig...' : 'Haal adres op'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Straat</label>
                      <input placeholder="Straat + huisnummer" value={bewerkWinkel.straat ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, straat: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Stad</label>
                      <input value={bewerkWinkel.stad ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, stad: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Land</label>
                      <select value={bewerkWinkel.land ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, land: (e.target.value || null) as 'Netherlands' | 'Belgium' | null })} className={inputClass} style={inputStyle}>
                        <option value="">— Niet gekozen</option>
                        <option value="Netherlands">🇳🇱 Nederland</option>
                        <option value="Belgium">🇧🇪 België</option>
                      </select>
                    </div>
                  </div>

                  {/* Systeemkeuze */}
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(13,31,78,0.02)', border: '1px solid rgba(13,31,78,0.08)' }}>
                    <p className="text-xs font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Systeem</p>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { value: 'cyclesoftware' as const, label: 'CycleSoftware', info: 'Gebruik dealer nummer voor voorraad' },
                        { value: 'wilmar' as const, label: 'Wilmar', info: 'Gebruik Wilmar koppeling (branch/organisation)' },
                      ].map(opt => (
                        <label key={opt.value} className="flex-1 min-w-[140px] cursor-pointer">
                          <input
                            type="radio"
                            name="bewerk_winkel_api_type"
                            value={opt.value}
                            checked={
                              (bewerkWinkel.api_type ??
                                (bewerkWinkel.wilmar_branch_id &&
                                bewerkWinkel.wilmar_organisation_id
                                  ? 'wilmar'
                                  : 'cyclesoftware')) === opt.value
                            }
                            onChange={() =>
                              setBewerkWinkel({ ...bewerkWinkel, api_type: opt.value })
                            }
                            className="sr-only"
                          />
                          <div
                            className="rounded-xl border-2 p-3 transition"
                            style={
                              (bewerkWinkel.api_type ??
                                (bewerkWinkel.wilmar_branch_id &&
                                bewerkWinkel.wilmar_organisation_id
                                  ? 'wilmar'
                                  : 'cyclesoftware')) === opt.value
                                ? { borderColor: DYNAMO_BLUE, background: 'rgba(13,31,78,0.04)' }
                                : { borderColor: 'rgba(13,31,78,0.1)' }
                            }
                          >
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                              {opt.label}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.45)', fontFamily: F }}>
                              {opt.info}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Wilmar koppeling */}
                  <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(13,31,78,0.03)', border: '1px solid rgba(13,31,78,0.08)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>🔗 Wilmar koppeling</p>
                      <button type="button" onClick={haalWilmarStoresOp} disabled={wilmarStoresLoading} className="text-xs px-2 py-1 rounded-lg transition hover:opacity-70" style={{ background: DYNAMO_BLUE, color: 'white', fontFamily: F }}>
                        {wilmarStoresLoading ? 'Laden...' : 'Laad Wilmar winkels'}
                      </button>
                    </div>

                    {/* Huidig gekoppeld — zonder dropdown */}
                    {wilmarBranchId && wilmarStores.length === 0 && (
                      <p className="text-xs" style={{ color: '#16a34a', fontFamily: F }}>
                        ✓ Gekoppeld (branch: {wilmarBranchId}) — klik op laden om te wijzigen
                      </p>
                    )}

                    {/* Zoekbare lijst na laden */}
                    {wilmarStores.length > 0 && (
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>Koppel aan Wilmar winkel</label>
                        <input
                          type="text"
                          placeholder="Zoek op naam of stad..."
                          value={wilmarZoekterm}
                          onChange={e => setWilmarZoekterm(e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        />
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border" style={{ borderColor: 'rgba(13,31,78,0.1)' }}>
                          {gefilterdeWilmarStores.length === 0 ? (
                            <div className="p-4 text-center text-xs" style={{ color: 'rgba(13,31,78,0.5)', fontFamily: F }}>
                              {wilmarZoekterm.trim() ? 'Geen resultaten gevonden' : 'Geen winkels'}
                            </div>
                          ) : (
                            gefilterdeWilmarStores.map(s => {
                              const isGeselecteerd = wilmarOrganisationId === s.organisationId && wilmarBranchId === s.branchId
                              return (
                                <button
                                  key={`${s.organisationId}-${s.branchId}`}
                                  type="button"
                                  onClick={() => {
                                    setWilmarOrganisationId(s.organisationId)
                                    setWilmarBranchId(s.branchId)
                                    setBewerkWinkel(prev => prev ? { ...prev, api_type: 'wilmar' } : null)
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs transition"
                                  style={{
                                    fontFamily: F,
                                    background: isGeselecteerd ? 'rgba(13,31,78,0.08)' : 'transparent',
                                    color: isGeselecteerd ? DYNAMO_BLUE : 'rgba(13,31,78,0.8)',
                                    borderBottom: '1px solid rgba(13,31,78,0.05)',
                                  }}
                                >
                                  {s.name || 'Winkel'} {s.city ? `(${s.city})` : ''}
                                </button>
                              )
                            })
                          )}
                        </div>
                        {wilmarBranchId != null && wilmarOrganisationId != null && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <p className="text-xs" style={{ color: '#16a34a', fontFamily: F }}>
                              ✓ Geselecteerd: {wilmarStores.find(s => s.organisationId === wilmarOrganisationId && s.branchId === wilmarBranchId)?.name ?? `org ${wilmarOrganisationId}, branch ${wilmarBranchId}`}
                            </p>
                            <button
                              type="button"
                              onClick={() => { setWilmarBranchId(null); setWilmarOrganisationId(null) }}
                              className="rounded-lg px-2 py-1 text-xs font-semibold"
                              style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontFamily: F }}
                            >
                              Ontkoppelen
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={winkelLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{winkelLoading ? 'Opslaan...' : 'Opslaan'}</button>
                    <button type="button" onClick={() => { setBewerkWinkel(null); setWilmarBranchId(null); setWilmarOrganisationId(null); setFormError('') }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70" style={{ border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <div className="p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                <div className="min-w-0">
                  <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Winkeloverzicht</div>
                  <div className="text-xs" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>{gefilterdeWinkels.length} van {winkels.length} winkels</div>
                </div>
                <input
                  type="text"
                  placeholder="Zoek op naam, stad, dealer, straat..."
                  value={winkelZoekterm}
                  onChange={e => setWinkelZoekterm(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs w-full sm:w-56"
                  style={{ background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select value={winkelFilterLand} onChange={e => setWinkelFilterLand(e.target.value as any)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                    <option value="alle">Alle landen</option>
                    <option value="Netherlands">🇳🇱 Nederland</option>
                    <option value="Belgium">🇧🇪 België</option>
                  </select>
                  <select value={winkelFilterLocatie} onChange={e => setWinkelFilterLocatie(e.target.value as any)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                    <option value="alle">Alle locaties</option>
                    <option value="zonder">📍 Zonder locatie</option>
                  </select>
                  <select value={winkelFilterSysteem} onChange={e => { const v = e.target.value as any; setWinkelFilterSysteem(v); setWinkelFilterApi('alle') }} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                    <option value="alle">Alle systemen</option>
                    <option value="cyclesoftware">CycleSoftware</option>
                    <option value="wilmar">Wilmar</option>
                  </select>
                  <select value={winkelFilterApi} onChange={e => setWinkelFilterApi(e.target.value as any)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(13,31,78,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                    {winkelFilterSysteem === 'wilmar' ? (
                      <>
                        <option value="alle">ALLE (toon alle winkels)</option>
                        <option value="gekoppeld">API: Gekoppeld</option>
                        <option value="niet_gekoppeld">API: Nog niet gekoppeld</option>
                      </>
                    ) : (
                      <>
                        <option value="alle">API: alle</option>
                        <option value="ok">API: ✓ In orde</option>
                        <option value="geen">API: ⚠ Geen toestemming</option>
                        <option value="niet_gecontroleerd">API: — Niet gecontroleerd</option>
                      </>
                    )}
                  </select>
                </div>
                {winkelFilterSysteem !== 'wilmar' && winkels.some(w => w.api_type !== 'wilmar' && !w.wilmar_organisation_id && !w.wilmar_branch_id && w.dealer_nummer) && (
                  <button onClick={verversCycleApiStatus} disabled={cycleStatusLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0" style={{ background: 'rgba(13,31,78,0.06)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                    {cycleStatusLoading ? 'Bezig...' : 'Ververs API-status'}
                  </button>
                )}
                {winkelFilterSysteem === 'wilmar' && winkels.some(w => (w.api_type === 'wilmar' || !w.api_type) && (!w.wilmar_organisation_id || !w.wilmar_branch_id)) && (
                  <button onClick={wilmarAutoKoppelen} disabled={wilmarAutoLinkLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0" style={{ background: 'rgba(22,163,74,0.1)', color: '#15803d', border: '1px solid rgba(22,163,74,0.25)', fontFamily: F }}>
                    {wilmarAutoLinkLoading ? 'Bezig...' : 'Wilmar auto-koppelen'}
                  </button>
                )}
              </div>
              {gefilterdeWinkels.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'rgba(13,31,78,0.35)', fontFamily: F }}>{winkels.length === 0 ? 'Nog geen winkels' : 'Geen winkels voldoen aan de filter'}</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(13,31,78,0.06)' }}>
                  {gefilterdeWinkels.map((w, i) => (
                    <div key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 transition hover:bg-gray-50/50">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: isBikeTotaal(w.naam) ? 'white' : WINKEL_KLEUREN[i % 8], border: isBikeTotaal(w.naam) ? '1px solid rgba(13,31,78,0.1)' : undefined }}>
                        {isBikeTotaal(w.naam) ? <img src={BIKE_TOTAAL_LOGO} alt="" className="w-full h-full object-contain p-1" /> : <span className="text-white text-sm font-bold">{w.naam.charAt(0)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</span>
                          {w.api_type === 'wilmar' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', fontFamily: F }}>Wilmar</span>
                          ) : (
                            <>
                              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.08)', color: 'rgba(13,31,78,0.5)', fontFamily: F }}>CycleSoftware</span>
                              {w.cycle_api_authorized === true && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', fontFamily: F }} title="API heeft rechten om voorraad op te halen">✓ API toegang</span>
                              )}
                              {w.cycle_api_authorized === false && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(234,179,8,0.2)', color: '#a16207', fontFamily: F }} title="Winkel heeft nog geen toestemming gegeven in CycleSoftware">⚠ Geen toestemming</span>
                              )}
                              {w.cycle_api_authorized == null && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(13,31,78,0.06)', color: 'rgba(13,31,78,0.4)', fontFamily: F }} title="Klik op 'Ververs API-status' om te controleren">—</span>
                              )}
                            </>
                          )}
                          {w.land && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: w.land === 'Belgium' ? 'rgba(253,218,36,0.2)' : 'rgba(255,102,0,0.15)', color: w.land === 'Belgium' ? '#a16207' : '#c2410c', fontFamily: F }}>{w.land === 'Belgium' ? '🇧🇪 België' : '🇳🇱 Nederland'}</span>
                          )}
                          {w.wilmar_organisation_id != null && w.wilmar_branch_id != null && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb', fontFamily: F }}>
                              🔗 Gekoppeld: {w.wilmar_store_naam || `org ${w.wilmar_organisation_id}, branch ${w.wilmar_branch_id}`}
                            </span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>
                          #{w.dealer_nummer}{w.straat ? ` · ${w.straat}` : ''}{w.stad ? ` · ${w.stad}` : ''}{w.postcode ? ` · ${w.postcode}` : ''}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2 shrink-0 sm:ml-auto">
                          <button onClick={() => startWinkelBewerken(w)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70 flex-1 sm:flex-initial" style={{ background: 'rgba(13,31,78,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>Bewerken</button>
                          <button onClick={() => verwijderWinkel(w.id, w.naam)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70 flex-1 sm:flex-initial" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: VERTROUWDE IP'S (alleen admin) ── */}
        {tab === 'ips' && (
          <div className="space-y-4">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <div className="p-4" style={{ borderBottom: '1px solid rgba(13,31,78,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Vertrouwde IP-adressen</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Vanaf deze IP&apos;s is geen MFA nodig bij inloggen. Ondersteunt exacte IP&apos;s (bijv. 192.168.1.100) en CIDR (bijv. 192.168.1.0/24).</div>
              </div>
              <div className="p-4 space-y-4">
                <form onSubmit={voegTrustedIpToe} className="flex gap-2">
                  <input
                    value={nieuwIp}
                    onChange={e => setNieuwIp(e.target.value)}
                    placeholder="192.168.1.100 of 192.168.1.0/24"
                    className={inputClass}
                    style={inputStyle}
                  />
                  <button type="submit" disabled={ipLoading || !nieuwIp.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                    {ipLoading ? 'Bezig...' : 'Toevoegen'}
                  </button>
                </form>
                {ipError && <div className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{ipError}</div>}
                <div className="divide-y" style={{ borderColor: 'rgba(13,31,78,0.06)' }}>
                  {trustedIps.length === 0 ? (
                    <div className="py-8 text-center text-sm" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Nog geen vertrouwde IP&apos;s. Voeg kantoor-IP&apos;s toe om MFA over te slaan.</div>
                  ) : (
                    trustedIps.map(ip => (
                      <div key={ip.id} className="flex items-center justify-between py-3">
                        <code className="text-sm font-mono" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{ip.ip_or_cidr}</code>
                        <button onClick={() => verwijderTrustedIp(ip.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: EXCEL IMPORT ── */}
        {tab === 'import' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <h2 className="text-sm font-bold mb-1" style={{ color: DYNAMO_BLUE, fontFamily: F, borderTop: `3px solid ${DYNAMO_GOLD}`, paddingTop: '12px', marginTop: '-4px' }}>📊 Winkels importeren via Excel</h2>
              <p className="text-xs mb-5" style={{ color: 'rgba(13,31,78,0.5)', fontFamily: F }}>Upload een .xlsx bestand met kolommen: <strong>naam</strong>, <strong>dealer_nummer</strong> (verplicht), <strong>postcode</strong>, <strong>straat</strong>, <strong>stad</strong>, <strong>land</strong> (optioneel: Nederland of België), <strong>api_type</strong> (optioneel: cyclesoftware of wilmar). Bestaande winkels met hetzelfde dealer_nummer worden bijgewerkt.</p>
              <div className="rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition hover:opacity-80" style={{ borderColor: 'rgba(13,31,78,0.15)', background: 'rgba(13,31,78,0.02)' }} onClick={() => fileInputRef.current?.click()}>
                <div className="text-3xl mb-2">📂</div>
                <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Klik om een Excel bestand te kiezen</div>
                <div className="text-xs mt-1" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Ondersteund: .xlsx, .xls</div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={verwerkExcel} />
              </div>
              {importError && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#fef2f2', color: '#dc2626', fontFamily: F }}>{importError}</div>}
              {importSuccess && <div className="mt-3 rounded-xl p-3 text-sm" style={{ background: '#f0fdf4', color: '#16a34a', fontFamily: F }}>✓ {importSuccess}</div>}
              {importProgress && (
                <div className="mt-3 rounded-xl p-4 space-y-2" style={{ background: 'rgba(13,31,78,0.04)', border: '1px solid rgba(13,31,78,0.1)', fontFamily: F }}>
                  <div className="flex justify-between text-sm font-semibold" style={{ color: DYNAMO_BLUE }}>
                    <span>{importProgress.current} van {importProgress.total} verwerkt</span>
                    <span style={{ color: 'rgba(13,31,78,0.5)' }}>{importProgress.toegevoegd} toegevoegd · {importProgress.bijgewerkt} bijgewerkt</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(13,31,78,0.06)' }}>
                    <div className="h-full transition-all duration-300" style={{ width: `${(importProgress.current / importProgress.total) * 100}%`, background: DYNAMO_BLUE }} />
                  </div>
                </div>
              )}
              {importData.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{importData.length} winkels gevonden</span>
                    <button onClick={() => { setImportData([]); if (fileInputRef.current) fileInputRef.current.value = '' }} className="text-xs hover:opacity-70" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>Wissen</button>
                  </div>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(13,31,78,0.08)' }}>
                    <table className="w-full text-xs">
                      <thead style={{ background: DYNAMO_BLUE }}>
                        <tr>{['Naam', 'Dealer #', 'Postcode', 'Straat', 'Stad', 'Land', 'API'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: 'rgba(255,255,255,0.7)', fontFamily: F }}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {importData.slice(0, 10).map((r, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.02)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                            <td className="px-3 py-2 font-medium" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.naam}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.dealer_nummer}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.postcode || '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.straat || '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.stad || '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.land ? (r.land === 'Belgium' ? 'België' : 'Nederland') : '—'}</td>
                            <td className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.6)', fontFamily: F }}>{r.api_type || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importData.length > 10 && <div className="px-3 py-2 text-xs text-center" style={{ color: 'rgba(13,31,78,0.4)', fontFamily: F }}>+ {importData.length - 10} meer rijen</div>}
                  </div>
                  <button onClick={importeerWinkels} disabled={importLoading} className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 transition hover:opacity-90" style={{ background: DYNAMO_BLUE, fontFamily: F }}>
                    {importLoading && importProgress
                      ? `Importeren... ${importProgress.current} van ${importProgress.total}`
                      : importLoading
                        ? 'Importeren...'
                        : `${importData.length} winkels importeren`}
                  </button>
                </div>
              )}
            </div>
            <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(13,31,78,0.07)', boxShadow: '0 2px 8px rgba(13,31,78,0.04)' }}>
              <h3 className="text-xs font-bold uppercase mb-3" style={{ color: 'rgba(13,31,78,0.4)', letterSpacing: '0.1em', fontFamily: F }}>Verwacht formaat</h3>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(13,31,78,0.08)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: DYNAMO_BLUE }}>
                    <tr>{['naam', 'dealer_nummer', 'postcode', 'straat', 'stad', 'land', 'api_type'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: DYNAMO_GOLD, fontFamily: F }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {[
                      ['Dynamo Amsterdam','10001','1012AB','Damrak 1','Amsterdam','Nederland','cyclesoftware'],
                      ['Dynamo Rotterdam','10002','3011AD','Coolsingel 42','Rotterdam','Nederland','cyclesoftware'],
                      ['Dynamo Brussel','10003','1000','Nieuwstraat 1','Brussel','België','wilmar'],
                    ].map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : 'rgba(13,31,78,0.02)', borderBottom: '1px solid rgba(13,31,78,0.05)' }}>
                        {r.map((c, j) => <td key={j} className="px-3 py-2" style={{ color: 'rgba(13,31,78,0.7)', fontFamily: F }}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}