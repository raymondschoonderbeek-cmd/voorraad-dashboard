'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { DYNAMO_BLUE } from '@/lib/theme'
import {
  IconStore, IconUsers, IconLock, IconBox, IconUpload,
  IconBike, IconNewspaper, IconImage, IconMonitor,
} from '@/components/DashboardIcons'
import { CampagneFietsenBeheerTab } from '@/components/campagne-fietsen/CampagneFietsenBeheerTab'
import { NieuwsBeheerTab } from '@/components/nieuws/NieuwsBeheerTab'
import { TrustedIpsTab } from '@/components/beheer/TrustedIpsTab'
import { BekendeMerkenTab } from '@/components/beheer/BekendeMerkenTab'
import { ImportTab } from '@/components/beheer/ImportTab'
import { PubliekeAfbeeldingenTab } from '@/components/beheer/PubliekeAfbeeldingenTab'
import { TvMededelingenTab } from '@/components/beheer/TvMededelingenTab'
import { DASHBOARD_MODULE_ORDER, type DashboardModuleId, type LandCode } from '@/lib/dashboard-modules'
import { MODULE_ROL_LABELS, MODULE_ROL_ORDER, type ModuleRol } from '@/lib/module-rollen'
const F = "'Outfit', sans-serif"
const BIKE_TOTAAL_LOGO = '/bike-totaal-logo.png'
const WINKEL_KLEUREN = ['#2D457C','#16a34a','#dc2626','#9333ea','#ea580c','#0891b2','#65a30d','#db2777']
function isBikeTotaal(naam: string) { return /bike\s*totaal/i.test(naam) }

type Rol = { id: number; user_id: string; rol: string; naam: string; mfa_verplicht?: boolean; created_at: string; manager_naam?: string | null; manager_email?: string | null }

const MODULE_LABELS: Record<DashboardModuleId, string> = {
  voorraad: 'Voorraad',
  lunch: 'Lunch',
  'brand-groep': 'Brandgroep',
  'campagne-fietsen': 'Campagnefietsen',
  'branche-nieuws': 'Branche nieuws',
  'interne-nieuws': 'Interne nieuwsberichten (eigen afdeling)',
  'nieuws-redacteur': 'Interne nieuwsberichten (alle afdelingen)',
  'it-cmdb': 'IT-hardware (CMDB)',
  beschikbaarheid: 'Beschikbaarheid team',
  winkels: 'Winkels & vestigingen',
  acquisitie: 'Acquisitie (contactmomenten)',
  'gazelle-orders': 'Gazelle pakket orders',
  meer: 'Meer',
}
type LandFilter = 'alle' | LandCode
type Winkel = {
  id: number
  naam: string
  kassa_nummer: string
  postcode?: string
  straat?: string
  huisnummer?: string
  stad?: string
  land?: 'Netherlands' | 'Belgium' | null
  lat?: number
  lng?: number
  wilmar_organisation_id?: number
  wilmar_branch_id?: number
  wilmar_store_naam?: string
  api_type?: 'cyclesoftware' | 'wilmar' | 'vendit' | 'vendit_api' | null
  vendit_api_key?: string | null
  vendit_api_username?: string | null
  vendit_api_password?: string | null
  cycle_api_authorized?: boolean | null
  vendit_in_dataset?: boolean
  vendit_laatst_datum?: string | null
  cycle_api_checked_at?: string | null
  lidnummer?: string | null
  cm_fietsen_deelname?: string | null
}
type Tab = 'gebruikers' | 'winkels' | 'import' | 'ips' | 'merken' | 'campagnefietsen' | 'nieuws' | 'afbeeldingen' | 'tv'

const IconArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
)

export default function BeheerPage() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => 'gebruikers')
  const [rollen, setRollen] = useState<Rol[]>([])
  const [winkels, setWinkels] = useState<Winkel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toonForm, setToonForm] = useState(false)
  const [bewerkGebruiker, setBewerkGebruiker] = useState<Rol | null>(null)
  const [bewerkEmail, setBewerkEmail] = useState('')
  const [bewerkWinkel, setBewerkWinkel] = useState<Winkel | null>(null)
  const [toonWinkelForm, setToonWinkelForm] = useState(false)
  const [winkelLoading, setWinkelLoading] = useState(false)
  const [winkelRefreshLoading, setWinkelRefreshLoading] = useState(false)

  // Nieuw gebruiker
  const [nieuwEmail, setNieuwEmail] = useState('')
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState('')
  const [nieuwRol, setNieuwRol] = useState('viewer')
  const [nieuwMfaVerplicht, setNieuwMfaVerplicht] = useState(false)
  const [nieuwModules, setNieuwModules] = useState<DashboardModuleId[]>(['voorraad', 'brand-groep', 'branche-nieuws', 'beschikbaarheid', 'meer'])
  const [nieuwLandFilter, setNieuwLandFilter] = useState<LandFilter>('alle')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  // Azure sync
  const [azureSyncLoading, setAzureSyncLoading] = useState(false)
  const [azureSyncResultaat, setAzureSyncResultaat] = useState<{
    totaal_azure: number; gefilterd: number; verwerkt: number; aangemaakt: number; profiel_gezet: number; manager_bijgewerkt: number; manager_gevonden: number; manager_geen: number; overgeslagen: number; fouten: string[]; filter_debug?: { gefilterd_domein: number; gefilterd_e3_licentie: number; gefilterd_geen_afdeling: number; e3_sku_ids_gevonden: number }
  } | null>(null)

  // Nieuw winkel form
  const [nieuwWinkelNaam, setNieuwWinkelNaam] = useState('')
  const [nieuwWinkelDealer, setNieuwWinkelDealer] = useState('')
  const [nieuwWinkelPostcode, setNieuwWinkelPostcode] = useState('')
  const [nieuwWinkelHuisnummer, setNieuwWinkelHuisnummer] = useState('')
  const [nieuwWinkelStad, setNieuwWinkelStad] = useState('')
  const [nieuwWinkelStraat, setNieuwWinkelStraat] = useState('')
  const [nieuwWinkelApiType, setNieuwWinkelApiType] = useState<'cyclesoftware' | 'wilmar' | 'vendit' | 'vendit_api'>('cyclesoftware')
  const [nieuwWinkelVenditApiKey, setNieuwWinkelVenditApiKey] = useState('')
  const [nieuwWinkelVenditApiUsername, setNieuwWinkelVenditApiUsername] = useState('')
  const [nieuwWinkelVenditApiPassword, setNieuwWinkelVenditApiPassword] = useState('')
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
  const [importType, setImportType] = useState<'winkels' | 'medewerkers'>('winkels')
  const [importData, setImportData] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; toegevoegd: number; bijgewerkt: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cycleStatusLoading, setCycleStatusLoading] = useState(false)
  const [venditTestLoading, setVenditTestLoading] = useState(false)
  const [venditTestResult, setVenditTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [resendInviteLoading, setResendInviteLoading] = useState<string | null>(null)
  const [impersonateLoadingUserId, setImpersonateLoadingUserId] = useState<string | null>(null)
  const [gebruikerZoekterm, setGebruikerZoekterm] = useState('')
  const [rolFilter, setRolFilter] = useState<'alle' | 'admin' | 'viewer' | 'lunch'>('alle')
  const [mfaStatus, setMfaStatus] = useState<Record<string, boolean>>({})
  const [userEmails, setUserEmails] = useState<Record<string, string>>({})
  const [userLastSignIns, setUserLastSignIns] = useState<Record<string, string | null>>({})
  const [profileModulesToegang, setProfileModulesToegang] = useState<Record<string, DashboardModuleId[] | null>>({})
  const [profileModulesResolved, setProfileModulesResolved] = useState<Record<string, DashboardModuleId[]>>({})
  const [profileLandenRaw, setProfileLandenRaw] = useState<Record<string, unknown>>({})
  const [bewerkModules, setBewerkModules] = useState<DashboardModuleId[]>([])
  const [bewerkModuleRollen, setBewerkModuleRollen] = useState<Record<string, ModuleRol | 'geen'>>({})
  const [nieuwModuleRollen, setNieuwModuleRollen] = useState<Record<string, ModuleRol | 'geen'>>({})
  const [bewerkLandFilter, setBewerkLandFilter] = useState<LandFilter>('alle')

  // Bulk module toewijzen
  const [bulkModulePanel, setBulkModulePanel] = useState(false)
  const [bulkModuleId, setBulkModuleId] = useState<DashboardModuleId>('voorraad')
  const [bulkSelectie, setBulkSelectie] = useState<Record<string, boolean>>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkSuccess, setBulkSuccess] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [bulkZoekterm, setBulkZoekterm] = useState('')

  // Vertrouwde IP's (alleen admin)
  const [trustedIps, setTrustedIps] = useState<{ id: number; ip_or_cidr: string; created_at: string }[]>([])
  const [nieuwIp, setNieuwIp] = useState('')
  const [ipLoading, setIpLoading] = useState(false)
  const [ipError, setIpError] = useState('')

  // Bekende merken (alleen admin) – voor Vendit merk-extractie
  const [bekendeMerken, setBekendeMerken] = useState<{ id: number; label: string; created_at: string }[]>([])
  const [nieuwMerk, setNieuwMerk] = useState('')
  const [merkLoading, setMerkLoading] = useState(false)
  const [merkError, setMerkError] = useState('')

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  /** Admin of dashboardmodule interne-nieuws: zelfde rechten als op /dashboard/nieuws/beheer */
  const [canManageInterneNieuws, setCanManageInterneNieuws] = useState(false)

  // Winkel filters
  const [winkelFilterSysteem, setWinkelFilterSysteem] = useState<'alle' | 'cyclesoftware' | 'wilmar' | 'vendit'>('alle')
  const [winkelFilterApi, setWinkelFilterApi] = useState<'alle' | 'ok' | 'geen' | 'niet_gecontroleerd' | 'gekoppeld' | 'niet_gekoppeld' | 'in_dataset' | 'niet_in_dataset' | 'ouder_dan_2_dagen'>('alle')
  const [winkelFilterLand, setWinkelFilterLand] = useState<'alle' | 'Netherlands' | 'Belgium'>('alle')
  const [winkelFilterLocatie, setWinkelFilterLocatie] = useState<'alle' | 'zonder'>('alle')
  const [winkelZoekterm, setWinkelZoekterm] = useState('')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeVoortgang, setGeocodeVoortgang] = useState<{
    totaal: number; gedaan: number; huidig: string | null; klaar: boolean
    log: { naam: string; status: 'ok' | 'mislukt' | 'overgeslagen'; reden?: string }[]
    bijgewerkt: number; mislukt: number; zonderAdres: number
  } | null>(null)

  const haalGebruikersOp = useCallback(async (light = true) => {
    setLoading(true)
    setError('')
    const res = await fetch(light ? '/api/gebruikers?light=1' : '/api/gebruikers')
    if (res.status === 403) {
      setError('Geen toegang. Alleen admins.')
      setLoading(false)
      return
    }
    const data = await res.json()
    setRollen(data.rollen ?? [])
    setWinkels(data.winkels ?? [])
    setMfaStatus(data.mfaStatus ?? {})
    setUserEmails(data.userEmails ?? {})
    setUserLastSignIns(data.userLastSignIns ?? {})
    setProfileModulesToegang(data.profileModulesToegang ?? {})
    setProfileModulesResolved(data.profileModulesResolved ?? {})
    setProfileLandenRaw(data.profileLandenRaw ?? {})
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

  const verversWinkels = useCallback(async () => {
    setWinkelRefreshLoading(true)
    setError('')
    if (isAdmin) {
      const res = await fetch('/api/gebruikers') // full data (incl. vendit)
      if (res.status === 403) {
        setError('Geen toegang. Alleen admins.')
      } else {
        const data = await res.json()
        setRollen(data.rollen ?? [])
        setWinkels(data.winkels ?? [])
        setMfaStatus(data.mfaStatus ?? {})
        setUserEmails(data.userEmails ?? {})
        setUserLastSignIns(data.userLastSignIns ?? {})
        setProfileModulesToegang(data.profileModulesToegang ?? {})
        setProfileModulesResolved(data.profileModulesResolved ?? {})
        setProfileLandenRaw(data.profileLandenRaw ?? {})
      }
    } else {
      const res = await fetch('/api/winkels')
      if (!res.ok) setError('Kon winkels niet laden.')
      else {
        const data = await res.json()
        setWinkels(Array.isArray(data) ? data : [])
      }
    }
    setWinkelRefreshLoading(false)
  }, [isAdmin])

  useEffect(() => {
    if (searchParams.get('locatie') === 'zonder') {
      setTab('winkels')
      setWinkelFilterLocatie('zonder')
    }
    if (searchParams.get('tab') === 'winkels') setTab('winkels')
    if (searchParams.get('tab') === 'gebruikers') setTab('gebruikers')
    if (searchParams.get('tab') === 'campagnefietsen') setTab('campagnefietsen')
    if (searchParams.get('tab') === 'nieuws') setTab('nieuws')
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    async function init() {
      const res = await fetch('/api/auth/session-info')
      const info = await res.json().catch(() => ({}))
      const admin = info.isAdmin === true
      const canNews = info.canManageInterneNieuws === true
      if (cancelled) return
      setIsAdmin(admin)
      setCanManageInterneNieuws(canNews)
      const urlTab = searchParams.get('tab')
      const adminTabs: Tab[] = ['gebruikers', 'winkels', 'import', 'ips', 'merken', 'campagnefietsen', 'nieuws']
      if (admin) {
        await haalGebruikersOp(true)
        if (cancelled) return
        if (urlTab && adminTabs.includes(urlTab as Tab)) setTab(urlTab as Tab)
        else setTab('gebruikers')
      } else {
        await haalWinkelsOp()
        if (cancelled) return
        if (urlTab === 'nieuws' && canNews) setTab('nieuws')
        else setTab('winkels')
      }
    }
    init()
    return () => { cancelled = true }
  }, [haalGebruikersOp, haalWinkelsOp, searchParams])

  useEffect(() => {
    if (nieuwRol === 'admin') setNieuwModules([...DASHBOARD_MODULE_ORDER])
    else if (nieuwRol === 'lunch') setNieuwModules(['lunch'])
    else setNieuwModules(['voorraad', 'brand-groep', 'branche-nieuws', 'meer'])
  }, [nieuwRol])

  function landLabelForUser(userId: string): string {
    const raw = profileLandenRaw[userId]
    if (raw == null) return 'Alle landen'
    if (Array.isArray(raw) && raw.length === 1 && raw[0] === 'Netherlands') return 'Nederland'
    if (Array.isArray(raw) && raw.length === 1 && raw[0] === 'Belgium') return 'België'
    return 'Alle landen'
  }
  function modulesLabelForUser(userId: string): string {
    const m = profileModulesResolved[userId] ?? []
    return m.map(x => MODULE_LABELS[x] ?? x).join(', ')
  }

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

  const haalMerkenOp = useCallback(async () => {
    const res = await fetch('/api/bekende-merken')
    if (res.ok) {
      const data = await res.json()
      setBekendeMerken(Array.isArray(data) ? data : [])
    } else {
      setBekendeMerken([])
    }
  }, [])

  useEffect(() => {
    if (isAdmin === true) haalMerkenOp()
  }, [isAdmin, haalMerkenOp])

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

  async function voegMerkToe(e: React.FormEvent) {
    e.preventDefault()
    const label = nieuwMerk.trim()
    if (!label) return
    setMerkLoading(true)
    setMerkError('')
    try {
      const res = await fetch('/api/bekende-merken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Fout: ${res.status}`)
      setNieuwMerk('')
      haalMerkenOp()
    } catch (err: unknown) {
      setMerkError(err instanceof Error ? err.message : 'Toevoegen mislukt')
    }
    setMerkLoading(false)
  }

  async function verwijderMerk(id: number) {
    if (!confirm('Dit merk verwijderen?')) return
    const res = await fetch(`/api/bekende-merken?id=${id}`, { method: 'DELETE' })
    if (res.ok) haalMerkenOp()
  }

  async function verversCycleApiStatus() {
    const cycleWinkels = gefilterdeWinkels.filter(w =>
      (w.api_type === 'cyclesoftware' || (!w.api_type && !w.wilmar_organisation_id && !w.wilmar_branch_id)) &&
      w.kassa_nummer?.trim()
    )
    if (cycleWinkels.length === 0) return
    setCycleStatusLoading(true)
    try {
      const res = await fetch('/api/voorraad/status/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cycleWinkels.map(w => ({ id: w.id, kassa_nummer: w.kassa_nummer })) }),
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
    setFormError('')
    try {
      const res = await fetch('/api/wilmar?action=stores')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof (data as { error?: string }).error === 'string'
          ? (data as { error: string }).error
          : `Wilmar laden mislukt (${res.status})`
        setFormError(msg)
        setWilmarStores([])
        return
      }
      setWilmarStores(Array.isArray(data) ? data : [])
    } catch {
      setFormError('Wilmar laden mislukt — netwerk of serverfout.')
      setWilmarStores([])
    } finally {
      setWilmarStoresLoading(false)
    }
  }

  async function testVenditCredentials(payload: { api_key: string; username: string; password: string } | { winkel_id: number }) {
    setVenditTestLoading(true)
    setVenditTestResult(null)
    try {
      const res = await fetch('/api/vendit-credentials-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setVenditTestResult({ ok: true, message: data.message ?? 'Credentials zijn geldig' })
      } else {
        setVenditTestResult({ ok: false, message: data.error ?? 'Test mislukt' })
      }
    } catch {
      setVenditTestResult({ ok: false, message: 'Netwerkfout' })
    }
    setVenditTestLoading(false)
  }

  async function haalAdresOp(isNieuw: boolean) {
    const postcode = isNieuw ? nieuwWinkelPostcode : (bewerkWinkel?.postcode ?? '')
    const huisnummer = isNieuw ? nieuwWinkelHuisnummer : bewerkHuisnummer
    const land = isNieuw ? nieuwWinkelLand : (bewerkWinkel?.land ?? '')
    if (!land) {
      setFormError('Selecteer eerst het land (Nederland of België) om het adres op te halen.')
      return
    }
    if (!postcode.trim() || !huisnummer.trim()) {
      setFormError('Vul postcode en huisnummer in om het adres op te halen.')
      return
    }
    setAdresLoading(true)
    setFormError('')
    try {
      const params = new URLSearchParams({ postcode: postcode.replace(/\s/g, ''), huisnummer })
      if (land === 'Belgium') params.set('land', 'Belgium')
      const res = await fetch(`/api/adres?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error ?? 'Adres niet gevonden.')
        return
      }
      if (isNieuw) {
        setNieuwWinkelStad(data.stad ?? '')
        setNieuwWinkelStraat(data.straat ?? '')
        setNieuwWinkelHuisnummer(data.huisnummer ?? huisnummer)
        if (data.postcode) setNieuwWinkelPostcode(data.postcode)
      } else if (bewerkWinkel) {
        setBewerkWinkel({
          ...bewerkWinkel,
          stad: data.stad ?? bewerkWinkel.stad,
          straat: data.straat ?? bewerkWinkel.straat,
          huisnummer: data.huisnummer ?? huisnummer ?? bewerkWinkel.huisnummer,
          postcode: data.postcode ?? bewerkWinkel.postcode,
          lat: data.lat ?? bewerkWinkel.lat,
          lng: data.lng ?? bewerkWinkel.lng,
        })
        setBewerkHuisnummer(data.huisnummer ?? huisnummer ?? bewerkWinkel.huisnummer ?? '')
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
    setBewerkHuisnummer(w.huisnummer ?? '')
    setFormError('')
    setFormSuccess('')
  }


  async function syncAzureGebruikers() {
    setAzureSyncLoading(true)
    setAzureSyncResultaat(null)
    const res = await fetch('/api/admin/azure-sync', { method: 'POST' })
    const data = await res.json()
    setAzureSyncLoading(false)
    if (!res.ok) {
      setFormError(data.error ?? 'Azure sync mislukt')
    } else {
      setAzureSyncResultaat(data)
      await haalGebruikersOp(true)
    }
  }

  async function voegGebruikerToe(e: React.FormEvent) {
    e.preventDefault()
    setFormLoading(true); setFormError(''); setFormSuccess('')
    const res = await fetch('/api/gebruikers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: nieuwEmail,
        naam: nieuwNaam,
        wachtwoord: nieuwWachtwoord || undefined,
        rol: nieuwRol,
        mfa_verplicht: nieuwMfaVerplicht,
        modules_toegang: nieuwModules,
        landen_toegang: nieuwLandFilter === 'alle' ? [] : [nieuwLandFilter],
      }),
    })
    const data = await res.json()
    setFormLoading(false)
    if (!res.ok) { setFormError(data.error ?? 'Er ging iets mis') }
    else {
      setFormSuccess(data.existingUser
        ? `${nieuwNaam || nieuwEmail} toegevoegd (was al geregistreerd).`
        : nieuwWachtwoord
          ? `Gebruiker aangemaakt. E-mail met wachtwoord verstuurd naar ${nieuwEmail}.`
          : `Uitnodiging verstuurd naar ${nieuwEmail}!`)
      setNieuwEmail(''); setNieuwNaam(''); setNieuwWachtwoord(''); setNieuwRol('viewer'); setNieuwMfaVerplicht(false); setNieuwLandFilter('alle')
      setToonForm(false)
      await haalGebruikersOp(true)
    }
  }

  async function stuurUitnodigingOpnieuw(userId: string) {
    setResendInviteLoading(userId)
    setFormError('')
    setFormSuccess('')
    try {
      const res = await fetch('/api/gebruikers/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setFormSuccess(data.warning ?? 'E-mail met nieuw wachtwoord verstuurd.')
      } else {
        setFormError(data.error ?? 'Versturen mislukt.')
      }
    } catch {
      setFormError('Versturen mislukt.')
    }
    setResendInviteLoading(null)
  }

  async function loginAlsGebruiker(userId: string, naam: string) {
    if (!confirm(`Je wordt uitgelogd als admin en ingelogd als ${naam.trim() || 'deze gebruiker'}. Doorgaan?`)) return
    setImpersonateLoadingUserId(userId)
    setError('')
    setFormError('')
    try {
      const res = await fetch('/api/auth/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          redirect_origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Mislukt')
      const link = typeof data.action_link === 'string' ? data.action_link : ''
      if (!link) throw new Error('Geen inloglink ontvangen')
      window.location.href = link
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inloggen als mislukt')
      setImpersonateLoadingUserId(null)
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
      body: JSON.stringify({
        user_id: bewerkGebruiker.user_id,
        rol: bewerkGebruiker.rol,
        naam: bewerkGebruiker.naam,
        email: emailChanged ? newEmail : undefined,
        mfa_verplicht: bewerkGebruiker.mfa_verplicht ?? false,
        modules_toegang: bewerkModules,
        landen_toegang: bewerkLandFilter === 'alle' ? [] : [bewerkLandFilter],
      }),
    })
    const data = await res.json().catch(() => ({}))
    setFormLoading(false)
    if (res.ok) {
      // Module-rollen opslaan
      await Promise.all(
        Object.entries(bewerkModuleRollen).map(([module, rol]) =>
          fetch('/api/admin/module-rollen', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: bewerkGebruiker.user_id, module, rol }),
          })
        )
      )
      setBewerkGebruiker(null)
      setBewerkEmail('')
      setBewerkModuleRollen({})
      setFormSuccess('Gebruiker opgeslagen.')
      await haalGebruikersOp(true)
    } else {
      setFormError(data.error ?? 'Opslaan mislukt.')
    }
  }

  async function verwijderGebruiker(userId: string, naam: string) {
    if (!confirm(`Gebruiker "${naam}" verwijderen?`)) return
    setFormError('')
    setFormSuccess('')
    const res = await fetch(`/api/gebruikers?user_id=${userId}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setFormError(data.error ?? 'Verwijderen mislukt.')
    } else {
      setFormSuccess('Gebruiker verwijderd.')
      await haalGebruikersOp(true)
    }
  }

  async function voegWinkelToe(e: React.FormEvent) {
    e.preventDefault()
    setWinkelLoading(true)
    const payload: Record<string, unknown> = {
      naam: nieuwWinkelNaam,
      kassa_nummer: nieuwWinkelDealer,
      postcode: nieuwWinkelPostcode,
      straat: nieuwWinkelStraat || undefined,
      huisnummer: nieuwWinkelHuisnummer || undefined,
      stad: nieuwWinkelStad,
      land: nieuwWinkelLand || undefined,
      api_type: nieuwWinkelApiType,
    }
    if (nieuwWinkelApiType === 'vendit_api') {
      payload.vendit_api_key = nieuwWinkelVenditApiKey.trim() || null
      payload.vendit_api_username = nieuwWinkelVenditApiUsername.trim() || null
      if (nieuwWinkelVenditApiPassword.trim()) payload.vendit_api_password = nieuwWinkelVenditApiPassword.trim()
    }
    const res = await fetch('/api/winkels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setNieuwWinkelNaam('')
    setNieuwWinkelDealer('')
    setNieuwWinkelPostcode('')
    setNieuwWinkelHuisnummer('')
    setNieuwWinkelStad('')
    setNieuwWinkelStraat('')
    setNieuwWinkelLand('')
    setNieuwWinkelApiType('cyclesoftware')
    setNieuwWinkelVenditApiKey('')
    setNieuwWinkelVenditApiUsername('')
    setNieuwWinkelVenditApiPassword('')
    setToonWinkelForm(false); setWinkelLoading(false)
    if (res.ok) {
      const data = await res.json()
      if (data?.id) setWinkels(prev => [...prev, data].sort((a, b) => (a.naam ?? '').localeCompare(b.naam ?? '')))
    }
  }

  async function slaWinkelOp(e: React.FormEvent) {
    e.preventDefault()
    if (!bewerkWinkel) return
    setWinkelLoading(true)
    setFormError('')
    setFormSuccess('')
    /** Radioknop is leidend: oude logica forceerde Wilmar zolang branch/org in state stonden, ook na switch naar CycleSoftware. */
    const gekozenApi: Winkel['api_type'] =
      bewerkWinkel.api_type ??
      (bewerkWinkel.wilmar_branch_id != null && bewerkWinkel.wilmar_organisation_id != null ? 'wilmar' : 'cyclesoftware')

    let wilmarOrg: number | null = null
    let wilmarBranch: number | null = null
    let wilmarNaam: string | null = null
    if (gekozenApi === 'wilmar') {
      wilmarOrg = wilmarOrganisationId ?? null
      wilmarBranch = wilmarBranchId ?? null
      const geselecteerdeWilmarStore = wilmarStores.find(
        s => s.organisationId === wilmarOrg && s.branchId === wilmarBranch
      )
      const uitStore = geselecteerdeWilmarStore?.name
        ? `${geselecteerdeWilmarStore.name}${geselecteerdeWilmarStore.city ? ` (${geselecteerdeWilmarStore.city})` : ''}`
        : null
      wilmarNaam =
        wilmarOrg != null && wilmarBranch != null
          ? (uitStore ?? bewerkWinkel.wilmar_store_naam ?? null)
          : null
    }

    const payload = {
      id: bewerkWinkel.id,
      naam: bewerkWinkel.naam,
      kassa_nummer: bewerkWinkel.kassa_nummer,
      postcode: bewerkWinkel.postcode,
      straat: bewerkWinkel.straat,
      huisnummer: bewerkHuisnummer?.trim() || null,
      stad: bewerkWinkel.stad,
      land: bewerkWinkel.land ?? null,
      wilmar_organisation_id: gekozenApi === 'wilmar' ? wilmarOrg : null,
      wilmar_branch_id: gekozenApi === 'wilmar' ? wilmarBranch : null,
      wilmar_store_naam: gekozenApi === 'wilmar' ? wilmarNaam : null,
      api_type: gekozenApi ?? 'cyclesoftware',
      vendit_api_key: (bewerkWinkel.vendit_api_key ?? '').trim() || null,
      vendit_api_username: (bewerkWinkel.vendit_api_username ?? '').trim() || null,
      ...((bewerkWinkel.vendit_api_password ?? '').trim() ? { vendit_api_password: (bewerkWinkel.vendit_api_password ?? '').trim() } : {}),
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
    setWinkels(prev => prev.map(w => w.id === payload.id ? { ...w, ...payload, huisnummer: payload.huisnummer ?? undefined } as Winkel : w))
  }

  async function verwijderWinkel(id: number, naam: string) {
    if (!confirm(`Winkel "${naam}" verwijderen?`)) return
    const res = await fetch(`/api/winkels?id=${id}`, { method: 'DELETE' })
    if (res.ok) setWinkels(prev => prev.filter(w => w.id !== id))
  }

  function startBewerken(rol: Rol) {
    setBewerkGebruiker(rol)
    setBewerkEmail(userEmails[rol.user_id] ?? '')
    setBewerkModules(profileModulesToegang[rol.user_id] ?? profileModulesResolved[rol.user_id] ?? [])
    setBewerkModuleRollen({})
    const raw = profileLandenRaw[rol.user_id]
    if (raw == null) setBewerkLandFilter('alle')
    else if (Array.isArray(raw) && raw.length === 1 && raw[0] === 'Netherlands') setBewerkLandFilter('Netherlands')
    else if (Array.isArray(raw) && raw.length === 1 && raw[0] === 'Belgium') setBewerkLandFilter('Belgium')
    else setBewerkLandFilter('alle')
    setToonForm(false)
    // Laad bestaande module-rollen voor deze gebruiker
    void fetch(`/api/admin/module-rollen?user_id=${rol.user_id}`)
      .then(r => r.json())
      .then((rollen: Record<string, ModuleRol>) => setBewerkModuleRollen(rollen))
      .catch(() => {})
  }

  async function slaaBulkModulesOp() {
    setBulkLoading(true)
    setBulkError('')
    setBulkSuccess('')

    // Alleen gebruikers waarvan de selectie VERANDERD is t.o.v. de huidige toestand
    const updates: { user_id: string; modules_toegang: DashboardModuleId[] }[] = []
    for (const rol of rollen) {
      if (rol.rol === 'admin') continue
      const uid = rol.user_id
      const hadModule = (profileModulesResolved[uid] ?? []).includes(bulkModuleId)
      const heeftModule = bulkSelectie[uid] ?? hadModule
      if (heeftModule === hadModule) continue

      const huidig = profileModulesResolved[uid] ?? []
      const nieuw: DashboardModuleId[] = heeftModule
        ? [...new Set([...huidig, bulkModuleId])]
        : huidig.filter(m => m !== bulkModuleId)
      updates.push({ user_id: uid, modules_toegang: nieuw })
    }

    if (updates.length === 0) {
      setBulkSuccess('Geen wijzigingen.')
      setBulkLoading(false)
      return
    }

    const res = await fetch('/api/gebruikers/modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    const data = await res.json().catch(() => ({}))
    setBulkLoading(false)

    if (res.ok) {
      setBulkSuccess(`${data.succeeded ?? updates.length} gebruiker${(data.succeeded ?? updates.length) !== 1 ? 's' : ''} bijgewerkt.`)
      await haalGebruikersOp(true)
      setBulkSelectie({})
    } else {
      setBulkError(data.error ?? data.message ?? 'Opslaan mislukt.')
    }
  }

  const gefilterdeGebruikers = useMemo(() => {
    const q = gebruikerZoekterm.trim().toLowerCase()
    return rollen.filter(rol => {
      if (rolFilter !== 'alle' && rol.rol !== rolFilter) return false
      if (!q) return true
      const naam = (rol.naam ?? '').toLowerCase()
      const email = (userEmails[rol.user_id] ?? '').toLowerCase()
      const rolNaam = (rol.rol ?? '').toLowerCase()
      const mod = modulesLabelForUser(rol.user_id).toLowerCase()
      const land = landLabelForUser(rol.user_id).toLowerCase()
      return naam.includes(q) || email.includes(q) || rolNaam.includes(q) || mod.includes(q) || land.includes(q)
    })
  }, [rollen, gebruikerZoekterm, rolFilter, userEmails, profileModulesResolved, profileLandenRaw])

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
          const dealer = String(r.kassa_nummer || r['Dealer nummer'] || r.dealerNummer || r.DEALER_NUMMER || r.dealer || r.Dealer || '').trim()
          return {
            naam: String(r.naam || r.Naam || r.NAAM || '').trim(),
            kassa_nummer: dealer,
            postcode: String(r.postcode || r.Postcode || r.POSTCODE || '').trim(),
            straat: String(r.straat || r.Straat || r.STRAAT || r.adres || r.Adres || '').trim(),
            huisnummer: String(r.huisnummer || r.Huisnummer || r.HUISNUMMER || r.nr || '').trim() || undefined,
            stad: String(r.stad || r.Stad || r.STAD || '').trim(),
            land: (landVal === 'belgië' || landVal === 'belgie' || landVal === 'belgium') ? 'Belgium' : ((landVal === 'nederland' || landVal === 'netherlands') ? 'Netherlands' : undefined),
            api_type: apiVal === 'wilmar' ? 'wilmar' : (apiVal === 'vendit' ? 'vendit' : (apiVal === 'vendit_api' ? 'vendit_api' : (apiVal === 'cyclesoftware' ? 'cyclesoftware' : undefined))),
          }
        }).filter(r => r.kassa_nummer)
        if (parsed.length === 0) {
          const heeftRijen = rows.length > 0
          setImportError(heeftRijen
            ? 'Geen geldige rijen gevonden. Elke rij moet een kassa_nummer hebben. Kolomnamen: kassa_nummer, Dealer nummer, of DEALER_NUMMER.'
            : 'Geen data gevonden. Zorg dat het bestand een eerste rij met kolomnamen heeft (naam, kassa_nummer, …) en daarna de data.')
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
      const bestaand = winkels.find(w => String(w.kassa_nummer).trim() === String(winkel.kassa_nummer).trim())
      if (bestaand) {
        const payload = {
          id: bestaand.id,
          naam: (winkel.naam?.trim()) ? winkel.naam.trim() : bestaand.naam,
          kassa_nummer: winkel.kassa_nummer,
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
          fouten.push(`Rij ${i + 1} (${winkel.kassa_nummer}): ${data?.error || res.statusText || res.status}`)
        }
      } else {
        if (!winkel.naam?.trim()) {
          fouten.push(`Rij ${i + 1} (${winkel.kassa_nummer}): Naam is verplicht voor nieuwe winkels`)
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
            fouten.push(`Rij ${i + 1} (${winkel.kassa_nummer}): ${data?.error || res.statusText || res.status}`)
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
        await haalGebruikersOp()
      }
    } catch {
      setImportError('Importeren mislukt')
    }
    setImportLoading(false)
  }

  async function geocodeerWinkels() {
    setGeocodeLoading(true)
    setGeocodeVoortgang({ totaal: 0, gedaan: 0, huidig: null, klaar: false, log: [], bijgewerkt: 0, mislukt: 0, zonderAdres: 0 })
    try {
      // Stap 1: wachtrij ophalen (snelle query, geen timeout-risico)
      const res = await fetch('/api/winkels/geocode', { method: 'GET' })
      const { teVerwerken = [], zonderAdres = [] } = await res.json() as {
        teVerwerken: { id: number; naam: string | null }[]
        zonderAdres: { id: number; naam: string | null }[]
      }

      setGeocodeVoortgang(v => v ? { ...v, totaal: teVerwerken.length, zonderAdres: zonderAdres.length } : v)

      // Winkels zonder adres direct in log zetten
      for (const w of zonderAdres) {
        setGeocodeVoortgang(v => v ? { ...v, log: [{ naam: w.naam ?? `#${w.id}`, status: 'overgeslagen', reden: 'Geen adres ingevuld' }, ...v.log] } : v)
      }

      // Stap 2: client loopt door de wachtrij, één POST per winkel
      let bijgewerkt = 0
      let mislukt = 0
      for (let i = 0; i < teVerwerken.length; i++) {
        const w = teVerwerken[i]
        setGeocodeVoortgang(v => v ? { ...v, huidig: w.naam ?? `#${w.id}` } : v)

        const r = await fetch('/api/winkels/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: w.id }),
        })
        const data = await r.json() as { ok: boolean; reden?: string }

        if (data.ok) {
          bijgewerkt++
          setGeocodeVoortgang(v => v ? { ...v, gedaan: i + 1, bijgewerkt, huidig: null, log: [{ naam: w.naam ?? `#${w.id}`, status: 'ok' }, ...v.log] } : v)
        } else {
          mislukt++
          setGeocodeVoortgang(v => v ? { ...v, gedaan: i + 1, mislukt, huidig: null, log: [{ naam: w.naam ?? `#${w.id}`, status: 'mislukt', reden: data.reden }, ...v.log] } : v)
        }

        // Nominatim rate-limit: 1 req/sec — wacht tussen verzoeken (niet na de laatste)
        if (i < teVerwerken.length - 1) {
          await new Promise(r => setTimeout(r, 1150))
        }
      }

      setGeocodeVoortgang(v => v ? { ...v, klaar: true, huidig: null } : v)
      if (bijgewerkt > 0) void haalWinkelsOp()
    } catch {
      setGeocodeVoortgang(v => v ? { ...v, klaar: true, huidig: null } : v)
    }
    setGeocodeLoading(false)
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
      setFormSuccess(n > 0 ? `${n} winkels automatisch gekoppeld aan Wilmar. Klik op Ververs om de wijzigingen te zien.` : 'Geen nieuwe koppelingen gevonden.')
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
      const isVendit = w.api_type === 'vendit'
      const isVenditApi = w.api_type === 'vendit_api'
      const isCycle = !isWilmar && !isVendit && !isVenditApi
      if (winkelFilterSysteem === 'cyclesoftware' && (isWilmar || isVendit || isVenditApi)) return false
      if (winkelFilterSysteem === 'wilmar' && (isCycle || isVendit || isVenditApi)) return false
      if (winkelFilterSysteem === 'vendit' && (isWilmar || isCycle)) return false
      if (winkelFilterLand !== 'alle' && w.land !== winkelFilterLand) return false
      if (winkelFilterLocatie === 'zonder' && (w.lat != null || w.lng != null)) return false
      if (winkelFilterApi !== 'alle') {
        if (winkelFilterSysteem === 'wilmar') {
          if (winkelFilterApi === 'gekoppeld') return isWilmar && w.wilmar_organisation_id != null && w.wilmar_branch_id != null
          if (winkelFilterApi === 'niet_gekoppeld') return isWilmar && (w.wilmar_organisation_id == null || w.wilmar_branch_id == null) && String(w.cm_fietsen_deelname ?? '').toLowerCase() !== 'nee'
        } else if (winkelFilterSysteem === 'vendit') {
          if (winkelFilterApi === 'in_dataset') return isVendit && w.vendit_in_dataset === true
          if (winkelFilterApi === 'niet_in_dataset') return isVendit && w.vendit_in_dataset === false && String(w.cm_fietsen_deelname ?? '').toLowerCase() !== 'nee'
          if (winkelFilterApi === 'ouder_dan_2_dagen') {
            if (!isVendit || !w.vendit_laatst_datum) return false
            const datum = new Date(w.vendit_laatst_datum).getTime()
            const tweeDagenGeleden = Date.now() - 2 * 24 * 60 * 60 * 1000
            return datum < tweeDagenGeleden
          }
        } else {
          if (winkelFilterApi === 'ok') return isCycle && w.cycle_api_authorized === true
          if (winkelFilterApi === 'geen') return isCycle && w.cycle_api_authorized === false && String(w.cm_fietsen_deelname ?? '').toLowerCase() !== 'nee'
          if (winkelFilterApi === 'niet_gecontroleerd') return w.cycle_api_authorized == null && String(w.cm_fietsen_deelname ?? '').toLowerCase() !== 'nee'
        }
      }
      if (zoek) {
        const naam = String(w.naam ?? '').toLowerCase()
        const stad = String(w.stad ?? '').toLowerCase()
        const dealer = String(w.kassa_nummer ?? '').toLowerCase()
        const straat = String(w.straat ?? '').toLowerCase()
        const postcode = String(w.postcode ?? '').toLowerCase()
        const wilmarNaam = String(w.wilmar_store_naam ?? '').toLowerCase()
        if (!naam.includes(zoek) && !stad.includes(zoek) && !dealer.includes(zoek) && !straat.includes(zoek) && !postcode.includes(zoek) && !wilmarNaam.includes(zoek)) return false
      }
      return true
    })
  }, [winkels, winkelFilterSysteem, winkelFilterApi, winkelFilterLand, winkelFilterLocatie, winkelZoekterm])

  const inputStyle = { background: 'var(--drg-input-bg)', border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', fontFamily: F, outline: 'none' }
  const inputClass = "w-full rounded-xl px-3 py-2 text-sm placeholder:text-gray-400"

  const tabs: { key: Tab; label: string; icon: ReactNode; count?: number }[] =
    isAdmin === true
      ? [
          { key: 'winkels', label: 'Winkels', icon: <IconStore size={14} />, count: winkels.length },
          { key: 'gebruikers', label: 'Gebruikers', icon: <IconUsers size={14} />, count: rollen.length },
          ...(!error ? [{ key: 'ips' as Tab, label: 'IP\'s', icon: <IconLock size={14} />, count: trustedIps.length }] : []),
          ...(!error ? [{ key: 'merken' as Tab, label: 'Merken', icon: <IconBox size={14} />, count: bekendeMerken.length }] : []),
          { key: 'import', label: 'Import', icon: <IconUpload size={14} /> },
          { key: 'campagnefietsen', label: 'Fietsen', icon: <IconBike size={14} /> },
          { key: 'nieuws', label: 'Nieuws', icon: <IconNewspaper size={14} /> },
          { key: 'afbeeldingen', label: 'Afbeeldingen', icon: <IconImage size={14} /> },
          { key: 'tv', label: 'TV', icon: <IconMonitor size={14} /> },
        ]
      : canManageInterneNieuws
        ? [
            { key: 'winkels', label: 'Winkels', icon: <IconStore size={14} />, count: winkels.length },
            { key: 'nieuws', label: 'Nieuws', icon: <IconNewspaper size={14} /> },
          ]
        : [{ key: 'winkels', label: 'Winkels', icon: <IconStore size={14} />, count: winkels.length }]

  return (
    <div className="p-3 sm:p-5 max-w-5xl mx-auto w-full space-y-4 sm:space-y-5 overflow-x-hidden">

        {/* Page head */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--drg-text-3)', fontFamily: F, marginBottom: 6 }}>Beheer</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--drg-ink-2)', fontFamily: F, lineHeight: 1.2, letterSpacing: '-0.02em', margin: 0 }}>Portal-instellingen &amp; toegang</h1>
            <p style={{ fontSize: 13, color: 'var(--drg-text-2)', fontFamily: F, marginTop: 4 }}>Beheer gebruikers, winkels, apparaat-catalogus en bronbestanden voor het DRG Portal.</p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href="/dashboard/ftp-koppeling"
                className="rounded-[8px] px-3 py-2 text-sm font-semibold transition hover:opacity-90 flex items-center gap-1.5"
                style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink-2)', background: 'var(--drg-card)', fontFamily: F, textDecoration: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.7h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.4a16 16 0 0 0 6 6l.91-1.14a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.01z"/></svg>
                Integraties & statussen
              </a>
              <a
                href="/dashboard/vendit-api-tester"
                className="rounded-[8px] px-3 py-2 text-sm font-semibold transition hover:opacity-90 flex items-center gap-1.5"
                style={{ border: '1px solid var(--drg-line)', color: 'var(--drg-ink-2)', background: 'var(--drg-card)', fontFamily: F, textDecoration: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                API Vendit
              </a>
            </div>
          )}
        </div>

        {error && <div className="rounded-[10px] p-4 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>{error}</div>}
        {formError && <div className="rounded-[10px] p-4 text-sm font-medium" style={{ background: '#fef2f2', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', fontFamily: F }}>{formError}</div>}
        {formSuccess && <div className="rounded-[10px] p-4 text-sm font-medium" style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.2)', color: '#16a34a', fontFamily: F }}>✓ {formSuccess}</div>}

        {/* Underline tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--drg-line)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 8 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key)
                setToonForm(false)
                setBewerkGebruiker(null)
                setToonWinkelForm(false)
                setBewerkWinkel(null)
                if (t.key === 'winkels' && isAdmin) {
                  fetch('/api/gebruikers').then(r => r.json()).then(d => {
                    setRollen(d.rollen ?? [])
                    setProfileModulesToegang(d.profileModulesToegang ?? {})
                    setProfileModulesResolved(d.profileModulesResolved ?? {})
                    setProfileLandenRaw(d.profileLandenRaw ?? {})
                    setWinkels(d.winkels ?? [])
                    setMfaStatus(d.mfaStatus ?? {})
                    setUserEmails(d.userEmails ?? {})
                    setUserLastSignIns(d.userLastSignIns ?? {})
                  }).catch(() => {})
                }
              }}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === t.key ? 600 : 500,
                color: tab === t.key ? 'var(--drg-ink-2)' : 'var(--drg-text-3)',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--drg-ink-2)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                fontFamily: F,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span style={{
                  fontSize: 10, fontWeight: 700, lineHeight: '16px',
                  padding: '1px 6px', borderRadius: 999,
                  background: tab === t.key ? 'var(--drg-info-bg)' : 'var(--drg-line)',
                  color: tab === t.key ? 'var(--drg-ink-2)' : 'var(--drg-text-3)',
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: GEBRUIKERS ── */}
        {tab === 'gebruikers' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <div className="flex gap-1.5 items-center flex-wrap">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none" style={{ color: 'rgba(45,69,124,0.3)' }}>⌕</span>
                    <input
                      type="text"
                      placeholder="Zoek naam, e-mail, module..."
                      value={gebruikerZoekterm}
                      onChange={e => setGebruikerZoekterm(e.target.value)}
                      className="rounded-xl px-3 py-2 pl-8 text-sm w-60"
                      style={{ background: 'var(--drg-card)', border: '1px solid var(--drg-line)', color: 'var(--drg-ink)', fontFamily: F, outline: 'none' }}
                    />
                    {gebruikerZoekterm && (
                      <button type="button" onClick={() => setGebruikerZoekterm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs" aria-label="Wis zoekterm">✕</button>
                    )}
                  </div>
                  {(['alle', 'admin', 'viewer', 'lunch'] as const).map(r => {
                    const counts: Record<string, number> = {
                      alle: rollen.length,
                      admin: rollen.filter(u => u.rol === 'admin').length,
                      viewer: rollen.filter(u => u.rol === 'viewer').length,
                      lunch: rollen.filter(u => u.rol === 'lunch').length,
                    }
                    const labels = { alle: 'Alle', admin: 'Admin', viewer: 'Viewer', lunch: 'Lunch' }
                    const active = rolFilter === r
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRolFilter(r)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5"
                        style={active
                          ? { background: 'var(--drg-ink-2)', color: 'white', fontFamily: F }
                          : { background: 'var(--drg-card)', border: '1px solid var(--drg-line)', color: 'var(--drg-text-2)', fontFamily: F }}
                      >
                        {labels[r]}
                        <span className="rounded-full px-1.5 text-xs font-bold" style={active ? { background: 'rgba(255,255,255,0.2)' } : { background: 'rgba(45,69,124,0.07)' }}>
                          {counts[r]}
                        </span>
                      </button>
                    )
                  })}
                  {(gebruikerZoekterm || rolFilter !== 'alle') && (
                    <button type="button" onClick={() => { setGebruikerZoekterm(''); setRolFilter('alle') }} className="text-xs rounded-lg px-2.5 py-1.5" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                      Wis filters
                    </button>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={syncAzureGebruikers}
                  disabled={azureSyncLoading}
                  title="Synchroniseer gebruikers vanuit Microsoft Entra (Azure AD)"
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                  style={{ borderColor: 'var(--drg-line)', color: 'var(--drg-ink-2)', fontFamily: F, background: 'var(--drg-card)' }}
                >
                  {azureSyncLoading ? (
                    <span className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: DYNAMO_BLUE }} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                    </svg>
                  )}
                  {azureSyncLoading ? 'Synchroniseren…' : 'Sync Microsoft'}
                </button>
                <button
                  type="button"
                  onClick={() => { setBulkModulePanel(v => !v); setBulkSelectie({}); setBulkSuccess(''); setBulkError('') }}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold border transition hover:opacity-90 flex items-center gap-2 shrink-0"
                  style={bulkModulePanel ? { background: 'var(--drg-ink-2)', color: 'white', fontFamily: F, borderColor: 'var(--drg-ink-2)' } : { borderColor: 'var(--drg-line)', color: 'var(--drg-ink-2)', fontFamily: F, background: 'var(--drg-card)' }}
                >
                  Modules toewijzen
                </button>
                <button onClick={() => { setToonForm(v => !v); setBewerkGebruiker(null) }} className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2 shrink-0" style={{ background: 'var(--drg-ink-2)', color: 'white', fontFamily: F }}>
                  + Gebruiker uitnodigen
                </button>
              </div>
              </div>
            </div>

            {azureSyncResultaat && (
              <div className="rounded-xl p-4 text-sm space-y-1" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.12)', fontFamily: F }}>
                <div className="font-semibold mb-2" style={{ color: DYNAMO_BLUE }}>Azure sync voltooid</div>
                <div style={{ color: 'rgba(45,69,124,0.7)' }}>
                  {azureSyncResultaat.totaal_azure} in Azure &nbsp;·&nbsp;
                  <span style={{ color: '#dc2626' }}>{azureSyncResultaat.gefilterd ?? 0} gefilterd</span> &nbsp;·&nbsp;
                  <span style={{ fontWeight: 600 }}>{azureSyncResultaat.verwerkt ?? 0} verwerkt</span> &nbsp;·&nbsp;
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>{azureSyncResultaat.aangemaakt} nieuw</span> &nbsp;·&nbsp;
                  {azureSyncResultaat.profiel_gezet} profiel gezet &nbsp;·&nbsp;
                  {azureSyncResultaat.manager_bijgewerkt ?? 0} bijgewerkt &nbsp;·&nbsp;
                  <span style={{ color: azureSyncResultaat.manager_gevonden > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {azureSyncResultaat.manager_gevonden ?? 0} managers gevonden
                  </span>
                  {(azureSyncResultaat.manager_geen ?? 0) > 0 && <>&nbsp;·&nbsp;{azureSyncResultaat.manager_geen} zonder manager</>}
                </div>
                {azureSyncResultaat.filter_debug && azureSyncResultaat.gefilterd > 0 && (
                  <div className="mt-2 text-xs rounded-lg p-2" style={{ background: 'rgba(220,38,38,0.06)', color: '#b91c1c', fontFamily: F }}>
                    <span className="font-bold">Filteranalyse:</span>{' '}
                    {azureSyncResultaat.filter_debug.e3_sku_ids_gevonden === 0
                      ? '⚠ Geen E3-SKU\'s gevonden in tenant (controleer licenties of SKU-patterns)'
                      : <>
                          {azureSyncResultaat.filter_debug.gefilterd_domein > 0 && <span>{azureSyncResultaat.filter_debug.gefilterd_domein} verkeerd domein · </span>}
                          {azureSyncResultaat.filter_debug.gefilterd_e3_licentie > 0 && <span>{azureSyncResultaat.filter_debug.gefilterd_e3_licentie} geen E3-licentie · </span>}
                          {azureSyncResultaat.filter_debug.gefilterd_geen_afdeling > 0 && <span>{azureSyncResultaat.filter_debug.gefilterd_geen_afdeling} geen afdeling</span>}
                          {' '}(E3 SKU-IDs: {azureSyncResultaat.filter_debug.e3_sku_ids_gevonden})
                        </>
                    }
                  </div>
                )}
                {azureSyncResultaat.fouten.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs" style={{ color: '#dc2626' }}>{azureSyncResultaat.fouten.length} fout(en)</summary>
                    <ul className="mt-1 space-y-0.5 text-xs" style={{ color: '#dc2626' }}>
                      {azureSyncResultaat.fouten.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Bulk module toewijzen */}
            {bulkModulePanel && (
              <div className="rounded-[10px] p-5 space-y-4" style={{ background: 'var(--drg-card)', border: '2px solid var(--drg-ink-2)', boxShadow: 'var(--drg-card-shadow)' }}>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold" style={{ color: 'var(--drg-ink)', fontFamily: F }}>Modules bulk toewijzen / ontkoppelen</h2>
                  <button type="button" onClick={() => setBulkModulePanel(false)} className="text-xs" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>✕ Sluiten</button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-semibold" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Module:</label>
                  <select
                    value={bulkModuleId}
                    onChange={e => { setBulkModuleId(e.target.value as DashboardModuleId); setBulkSelectie({}) }}
                    className="rounded-xl px-3 py-2 text-sm"
                    style={{ background: 'white', border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                  >
                    {DASHBOARD_MODULE_ORDER.map(id => (
                      <option key={id} value={id}>{MODULE_LABELS[id]}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 items-center">
                  <div className="relative flex-1 max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none" style={{ color: 'rgba(45,69,124,0.3)' }}>⌕</span>
                    <input
                      type="text"
                      placeholder="Zoek gebruiker..."
                      value={bulkZoekterm}
                      onChange={e => setBulkZoekterm(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 pl-8 text-sm"
                      style={{ background: 'white', border: '1px solid rgba(45,69,124,0.12)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                    />
                    {bulkZoekterm && (
                      <button type="button" onClick={() => setBulkZoekterm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">✕</button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const zichtbaar = rollen.filter(r => r.rol !== 'admin' && (!bulkZoekterm.trim() || (r.naam ?? '').toLowerCase().includes(bulkZoekterm.toLowerCase()) || (userEmails[r.user_id] ?? '').toLowerCase().includes(bulkZoekterm.toLowerCase())))
                      const allesAan = zichtbaar.every(r => {
                        const huidig = (profileModulesResolved[r.user_id] ?? []).includes(bulkModuleId)
                        return bulkSelectie[r.user_id] !== undefined ? bulkSelectie[r.user_id] : huidig
                      })
                      const nieuw: Record<string, boolean> = { ...bulkSelectie }
                      for (const r of zichtbaar) nieuw[r.user_id] = !allesAan
                      setBulkSelectie(nieuw)
                    }}
                    className="text-xs rounded-lg px-3 py-2 border transition shrink-0"
                    style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}
                  >
                    Alles aan/uit
                  </button>
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(45,69,124,0.1)' }}>
                  <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.04)', color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
                    <span>Toegang</span><span>Gebruiker</span><span>Status</span>
                  </div>
                  <div className="divide-y divide-dynamo-blue-light/10" style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {rollen.filter(r => {
                      if (r.rol === 'admin') return false
                      if (!bulkZoekterm.trim()) return true
                      const q = bulkZoekterm.toLowerCase()
                      return (r.naam ?? '').toLowerCase().includes(q) || (userEmails[r.user_id] ?? '').toLowerCase().includes(q)
                    }).map(rol => {
                      const uid = rol.user_id
                      const hadModule = (profileModulesResolved[uid] ?? []).includes(bulkModuleId)
                      const heeftModule = bulkSelectie[uid] !== undefined ? bulkSelectie[uid] : hadModule
                      const gewijzigd = heeftModule !== hadModule
                      return (
                        <label key={uid} className="grid grid-cols-[auto_1fr_auto] gap-x-3 items-center px-3 py-2.5 cursor-pointer transition hover:bg-gray-50/60" style={{ background: gewijzigd ? 'rgba(45,69,124,0.03)' : 'white', fontFamily: F }}>
                          <input
                            type="checkbox"
                            checked={heeftModule}
                            onChange={e => setBulkSelectie(prev => ({ ...prev, [uid]: e.target.checked }))}
                            className="accent-[#2D457C] w-4 h-4"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: DYNAMO_BLUE }}>{rol.naam || userEmails[uid] || uid}</div>
                            <div className="text-xs truncate" style={{ color: 'rgba(45,69,124,0.45)' }}>{userEmails[uid]}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {gewijzigd
                              ? <span className="text-xs rounded-full px-2 py-0.5 font-semibold" style={{ background: heeftModule ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)', color: heeftModule ? '#16a34a' : '#dc2626' }}>{heeftModule ? '+ Toevoegen' : '− Verwijderen'}</span>
                              : <span className="text-xs rounded-full px-2 py-0.5" style={{ background: hadModule ? 'rgba(45,69,124,0.08)' : 'rgba(45,69,124,0.04)', color: hadModule ? DYNAMO_BLUE : 'rgba(45,69,124,0.35)' }}>{hadModule ? 'Heeft toegang' : 'Geen toegang'}</span>
                            }
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {bulkError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{bulkError}</p>}
                {bulkSuccess && <p className="text-sm" style={{ color: '#16a34a', fontFamily: F }}>✓ {bulkSuccess}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={slaaBulkModulesOp}
                    disabled={bulkLoading}
                    className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: DYNAMO_BLUE, fontFamily: F }}
                  >
                    {bulkLoading ? 'Bezig...' : 'Wijzigingen opslaan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBulkSelectie({}); setBulkSuccess(''); setBulkError('') }}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition"
                    style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}
                  >
                    Reset selectie
                  </button>
                </div>
              </div>
            )}

            {toonForm && (
              <div className="rounded-[10px] p-5 space-y-4" style={{ background: 'var(--drg-card)', border: '2px solid var(--drg-ink-2)', boxShadow: 'var(--drg-card-shadow)' }}>
                <h2 className="text-sm font-bold" style={{ color: 'var(--drg-ink)', fontFamily: F }}>Nieuwe gebruiker aanmaken</h2>
                <form onSubmit={voegGebruikerToe} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>E-mailadres *</label>
                      <input type="email" placeholder="naam@bedrijf.nl" value={nieuwEmail} onChange={e => setNieuwEmail(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Naam</label>
                      <input type="text" placeholder="Volledige naam" value={nieuwNaam} onChange={e => setNieuwNaam(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Wachtwoord <span style={{ fontWeight: 400, opacity: 0.6 }}>(min. 8 tekens; wordt per e-mail verstuurd)</span></label>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Kies of genereer wachtwoord" value={nieuwWachtwoord} onChange={e => setNieuwWachtwoord(e.target.value)} className={inputClass} style={{ ...inputStyle, flex: 1 }} minLength={8} autoComplete="off" />
                      <button type="button" onClick={() => setNieuwWachtwoord(Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 32]).join(''))} className="rounded-xl px-4 py-2.5 text-sm font-semibold shrink-0" style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}>Genereer</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Rol</label>
                    <div className="flex gap-3">
                      {[{ value: 'viewer', label: 'Viewer', info: 'Kan voorraad bekijken' }, { value: 'lunch', label: 'Lunch', info: 'Alleen lunch bestellen' }, { value: 'admin', label: 'Admin', info: 'Volledige toegang' }].map(r => (
                        <label key={r.value} className="flex-1 cursor-pointer">
                          <input type="radio" name="rol" value={r.value} checked={nieuwRol === r.value} onChange={() => setNieuwRol(r.value)} className="sr-only" />
                          <div className="rounded-xl border-2 p-3 transition" style={nieuwRol === r.value ? { borderColor: DYNAMO_BLUE, background: 'rgba(45,69,124,0.04)' } : { borderColor: 'rgba(45,69,124,0.1)' }}>
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{r.label}</div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>{r.info}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="nieuw_mfa_verplicht" checked={nieuwMfaVerplicht} onChange={e => setNieuwMfaVerplicht(e.target.checked)} className="accent-[#2D457C]" />
                    <label htmlFor="nieuw_mfa_verplicht" className="text-xs font-semibold cursor-pointer" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>MFA verplicht voor deze gebruiker</label>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Dashboard-modules</label>
                    {nieuwRol === 'lunch' ? (
                      <p className="text-xs" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>Lunch-gebruikers zien alleen de lunch-pagina.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {DASHBOARD_MODULE_ORDER.map(id => (
                          <label key={id} className="flex items-center gap-2 cursor-pointer rounded-xl border p-2.5 transition" style={nieuwModules.includes(id) ? { borderColor: DYNAMO_BLUE, background: 'rgba(45,69,124,0.04)' } : { borderColor: 'rgba(45,69,124,0.1)' }}>
                            <input
                              type="checkbox"
                              checked={nieuwModules.includes(id)}
                              onChange={() => {
                                setNieuwModules(prev =>
                                  prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                                )
                              }}
                              className="accent-[#2D457C]"
                            />
                            <span className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{MODULE_LABELS[id]}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Winkels tonen (land)</label>
                    <select
                      value={nieuwLandFilter}
                      onChange={e => setNieuwLandFilter(e.target.value as LandFilter)}
                      className={inputClass}
                      style={inputStyle}
                    >
                      <option value="alle">Alle landen</option>
                      <option value="Netherlands">Alleen Nederland</option>
                      <option value="Belgium">Alleen België</option>
                    </select>
                  </div>
                  {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{formLoading ? 'Bezig...' : nieuwWachtwoord ? 'Aanmaken en e-mail versturen' : 'Uitnodiging versturen'}</button>
                    <button type="button" onClick={() => setToonForm(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition" style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            {/* Bewerk-modal — fixed overlay zodat de positie in de lijst niet uitmaakt */}
            {bewerkGebruiker && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.45)' }}
                onClick={e => { if (e.target === e.currentTarget) { setBewerkGebruiker(null); setBewerkEmail('') } }}
              >
                <div className="w-full max-w-2xl rounded-[10px] shadow-2xl overflow-y-auto" style={{ background: 'var(--drg-card)', maxHeight: 'calc(100dvh - 2rem)' }}>
                  <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--drg-line)', background: 'var(--drg-card)', zIndex: 1 }}>
                    <h2 className="text-base font-bold" style={{ color: 'var(--drg-ink)', fontFamily: F }}>✏️ {bewerkGebruiker.naam} bewerken</h2>
                    <button type="button" onClick={() => { setBewerkGebruiker(null); setBewerkEmail('') }} className="rounded-lg w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 transition" style={{ color: 'rgba(45,69,124,0.4)' }}>✕</button>
                  </div>
                  <form onSubmit={updateGebruiker} className="p-6 space-y-5">
                    {(bewerkGebruiker.manager_naam || bewerkGebruiker.manager_email) && (
                      <div className="rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                        <span className="font-semibold" style={{ color: 'rgba(45,69,124,0.6)' }}>Manager (Azure AD): </span>
                        <span style={{ color: DYNAMO_BLUE }}>{bewerkGebruiker.manager_naam ?? '—'}</span>
                        {bewerkGebruiker.manager_email && (
                          <span style={{ color: 'rgba(45,69,124,0.45)' }}> · {bewerkGebruiker.manager_email}</span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Naam</label>
                        <input type="text" value={bewerkGebruiker.naam} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, naam: e.target.value })} className={inputClass} style={inputStyle} placeholder="Volledige naam" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>E-mailadres</label>
                        <input type="email" value={bewerkEmail} onChange={e => setBewerkEmail(e.target.value)} className={inputClass} style={inputStyle} placeholder="naam@bedrijf.nl" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Rol</label>
                        <select value={bewerkGebruiker.rol} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, rol: e.target.value })} className={inputClass} style={inputStyle}>
                          <option value="viewer">Viewer</option>
                          <option value="lunch">Lunch</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 self-end pb-2">
                        <input type="checkbox" id="mfa_verplicht" checked={bewerkGebruiker.mfa_verplicht ?? false} onChange={e => setBewerkGebruiker({ ...bewerkGebruiker, mfa_verplicht: e.target.checked })} className="accent-[#2D457C]" />
                        <label htmlFor="mfa_verplicht" className="text-xs font-semibold cursor-pointer" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>MFA verplicht</label>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Dashboard-modules & rechten</label>
                      {bewerkGebruiker.rol === 'lunch' ? (
                        <p className="text-xs" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>Lunch-gebruikers zien alleen de lunch-pagina.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {DASHBOARD_MODULE_ORDER.map(id => {
                            const rolWaarde: ModuleRol | 'geen' = bewerkModuleRollen[id] ?? (bewerkModules.includes(id) ? 'viewer' : 'geen')
                            return (
                              <div key={id} className="flex items-center gap-3 rounded-xl border px-3 py-2" style={{ borderColor: rolWaarde !== 'geen' ? DYNAMO_BLUE : 'rgba(45,69,124,0.1)', background: rolWaarde !== 'geen' ? 'rgba(45,69,124,0.04)' : 'transparent' }}>
                                <span className="text-xs font-semibold flex-1" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{MODULE_LABELS[id]}</span>
                                <select
                                  value={rolWaarde}
                                  onChange={e => {
                                    const nieuw = e.target.value as ModuleRol | 'geen'
                                    setBewerkModuleRollen(prev => ({ ...prev, [id]: nieuw }))
                                    if (nieuw === 'geen') {
                                      setBewerkModules(prev => prev.filter(x => x !== id))
                                    } else if (!bewerkModules.includes(id)) {
                                      setBewerkModules(prev => [...prev, id])
                                    }
                                  }}
                                  className="text-xs rounded-lg border px-2 py-1"
                                  style={{ borderColor: 'rgba(45,69,124,0.2)', color: DYNAMO_BLUE, background: 'white', fontFamily: F }}
                                >
                                  <option value="geen">Geen toegang</option>
                                  {MODULE_ROL_ORDER.map(r => (
                                    <option key={r} value={r}>{MODULE_ROL_LABELS[r]}</option>
                                  ))}
                                </select>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Winkels tonen (land)</label>
                      <select value={bewerkLandFilter} onChange={e => setBewerkLandFilter(e.target.value as LandFilter)} className={inputClass} style={inputStyle}>
                        <option value="alle">Alle landen</option>
                        <option value="Netherlands">Alleen Nederland</option>
                        <option value="Belgium">Alleen België</option>
                      </select>
                    </div>
                    {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                    <div className="flex flex-wrap gap-3 pt-1 border-t" style={{ borderColor: 'rgba(45,69,124,0.08)' }}>
                      <button type="submit" disabled={formLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{formLoading ? 'Opslaan...' : 'Opslaan'}</button>
                      <button type="button" onClick={() => { setBewerkGebruiker(null); setBewerkEmail('') }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70 transition" style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Annuleren</button>
                      <button
                        type="button"
                        onClick={() => loginAlsGebruiker(bewerkGebruiker.user_id, bewerkGebruiker.naam)}
                        disabled={impersonateLoadingUserId === bewerkGebruiker.user_id}
                        className="rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ml-auto"
                        style={{ border: '1px solid rgba(45,69,124,0.2)', color: DYNAMO_BLUE, fontFamily: F }}
                        title="Admin-sessie beëindigen; je logt in als deze gebruiker"
                      >
                        {impersonateLoadingUserId === bewerkGebruiker.user_id ? 'Bezig…' : '🔑 Inloggen als'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
              <div className="p-4" style={{ borderBottom: '1px solid var(--drg-line)' }}>
                <div className="text-sm font-bold" style={{ color: 'var(--drg-ink-2)', fontFamily: F }}>Gebruikersoverzicht</div>
                <div className="text-xs" style={{ color: 'var(--drg-text-3)', fontFamily: F }}>
                  {gebruikerZoekterm ? `${gefilterdeGebruikers.length} van ${rollen.length} gebruikers` : `${rollen.length} gebruikers`}
                </div>
              </div>
              {loading ? (
                <div className="p-10 text-center"><div className="w-7 h-7 border-2 border-gray-200 rounded-full animate-spin mx-auto mb-2" style={{ borderTopColor: DYNAMO_BLUE }} /></div>
              ) : gefilterdeGebruikers.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'rgba(45,69,124,0.35)', fontFamily: F }}>{gebruikerZoekterm ? 'Geen gebruikers gevonden' : 'Nog geen gebruikers'}</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(45,69,124,0.06)' }}>
                  {gefilterdeGebruikers.map(rol => (
                    <div key={rol.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-gray-50/50">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: 'var(--drg-ink-2)', fontFamily: F }}>
                        {(rol.naam || 'G').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: 'var(--drg-ink-2)', fontFamily: F }}>{rol.naam || '(Geen naam)'}</span>
                          {rol.rol === 'admin'
                            ? <span style={{ background: 'var(--drg-admin-bg)', color: 'var(--drg-admin)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px', height: 20, lineHeight: '20px', borderRadius: 999, display: 'inline-flex', alignItems: 'center' }}>Admin</span>
                            : rol.rol === 'lunch'
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--drg-success-bg)', color: 'var(--drg-success)' }}>🥪 Lunch</span>
                            : <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--drg-line)', color: 'var(--drg-text-2)' }}>👁 Viewer</span>
                          }
                          {mfaStatus[rol.user_id] === true && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--drg-success-bg)', color: 'var(--drg-success)' }} title="MFA ingeschakeld">✓ MFA</span>
                          )}
                          {mfaStatus[rol.user_id] === false && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--drg-line-2)', color: 'var(--drg-text-3)' }} title="MFA niet ingesteld">Geen MFA</span>
                          )}
                          {rol.mfa_verplicht && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--drg-danger-bg)', color: 'var(--drg-danger)' }} title="MFA verplicht">MFA verplicht</span>
                          )}
                          {rol.rol !== 'admin' && profileModulesResolved[rol.user_id]?.includes('campagne-fietsen') && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE }} title="Campagnefietsen">🚲 Campagnefietsen</span>
                          )}
                        </div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--drg-text-2)', fontFamily: F }}>{userEmails[rol.user_id] || '(Geen e-mail)'}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--drg-text-3)', fontFamily: F }}>{modulesLabelForUser(rol.user_id)}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--drg-text-3)', fontFamily: F }}>Land: {landLabelForUser(rol.user_id)}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--drg-text-3)', fontFamily: F }} title="Laatste inlog">
                          {userLastSignIns[rol.user_id]
                            ? `Laatste inlog: ${new Date(userLastSignIns[rol.user_id]!).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })}`
                            : 'Nog nooit ingelogd'}
                        </div>
                        {rol.manager_naam && (
                          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--drg-text-3)', fontFamily: F }} title={rol.manager_email ?? rol.manager_naam}>
                            Manager: {rol.manager_naam}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0 flex-wrap">
                        <button onClick={() => stuurUitnodigingOpnieuw(rol.user_id)} disabled={resendInviteLoading === rol.user_id} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70 disabled:opacity-50" style={{ background: 'var(--drg-line-2)', color: 'var(--drg-ink-2)', border: '1px solid var(--drg-line)', fontFamily: F }} title="Stuur inloggegevens opnieuw per e-mail">{resendInviteLoading === rol.user_id ? '...' : 'Opnieuw uitnodigen'}</button>
                        <button
                          type="button"
                          onClick={() => loginAlsGebruiker(rol.user_id, rol.naam)}
                          disabled={impersonateLoadingUserId === rol.user_id}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70 disabled:opacity-50"
                          style={{ background: 'var(--drg-line-2)', color: 'var(--drg-ink-2)', border: '1px solid var(--drg-line)', fontFamily: F }}
                          title="Inloggen als deze gebruiker (je admin-sessie wordt beëindigd)"
                        >
                          {impersonateLoadingUserId === rol.user_id ? '…' : 'Inloggen als'}
                        </button>
                        <button onClick={() => startBewerken(rol)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'var(--drg-line-2)', color: 'var(--drg-ink-2)', border: '1px solid var(--drg-line)', fontFamily: F }}>Bewerken</button>
                        <button onClick={() => verwijderGebruiker(rol.user_id, rol.naam)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70" style={{ background: 'var(--drg-danger-bg)', color: 'var(--drg-danger)', border: '1px solid rgba(220,38,38,0.15)', fontFamily: F }}>Verwijderen</button>
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
                <button onClick={() => { setToonWinkelForm(v => !v); setBewerkWinkel(null) }} className="rounded-xl px-5 py-2.5 text-sm font-bold transition hover:opacity-90 flex items-center gap-2" style={{ background: 'var(--drg-ink-2)', color: 'white', fontFamily: F }}>
                  + Winkel toevoegen
                </button>
              </div>
            )}

            {isAdmin && toonWinkelForm && (
              <div className="rounded-[10px] p-5" style={{ background: 'var(--drg-card)', border: '2px solid var(--drg-ink-2)', boxShadow: 'var(--drg-card-shadow)' }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--drg-ink)', fontFamily: F }}>Nieuwe winkel</h2>
                <form onSubmit={voegWinkelToe} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Naam *</label>
                      <input placeholder="Winkel naam" value={nieuwWinkelNaam} onChange={e => setNieuwWinkelNaam(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Kassanummer *</label>
                      <input placeholder="bijv. 12345" value={nieuwWinkelDealer} onChange={e => setNieuwWinkelDealer(e.target.value)} className={inputClass} style={inputStyle} required />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-semibold mb-1" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Adres (optioneel — vul postcode + huisnummer in en klik op Haal adres op)</div>
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[100px]">
                          <input placeholder="Postcode (1234AB)" value={nieuwWinkelPostcode} onChange={e => setNieuwWinkelPostcode(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <div className="w-24">
                          <input placeholder="Nr." value={nieuwWinkelHuisnummer} onChange={e => setNieuwWinkelHuisnummer(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <button type="button" onClick={() => haalAdresOp(true)} disabled={adresLoading} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50" style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.12)', fontFamily: F }}>
                          {adresLoading ? 'Bezig...' : 'Haal adres op'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Straat</label>
                      <input placeholder="Straat" value={nieuwWinkelStraat} onChange={e => setNieuwWinkelStraat(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Stad</label>
                      <input placeholder="bijv. Amsterdam" value={nieuwWinkelStad} onChange={e => setNieuwWinkelStad(e.target.value)} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Land</label>
                      <select value={nieuwWinkelLand} onChange={e => setNieuwWinkelLand(e.target.value as 'Netherlands' | 'Belgium' | '')} className={inputClass} style={inputStyle}>
                        <option value="">— Niet gekozen</option>
                        <option value="Netherlands">🇳🇱 Nederland</option>
                        <option value="Belgium">🇧🇪 België</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>
                      Systeem
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { value: 'cyclesoftware', label: 'CycleSoftware', info: 'Standaard koppeling via dealer nummer' },
                        { value: 'wilmar', label: 'Wilmar', info: 'Gebruik Wilmar API met branch koppeling' },
                        { value: 'vendit', label: 'Vendit', info: 'Voorraad uit Supabase vendit_stock (dealer nummer)' },
                        { value: 'vendit_api', label: 'Vendit API', info: 'Vendit Public API met eigen credentials' },
                      ].map(opt => (
                        <label key={opt.value} className="flex-1 min-w-[140px] cursor-pointer">
                          <input
                            type="radio"
                            name="winkel_api_type"
                            value={opt.value}
                            checked={nieuwWinkelApiType === opt.value}
                            onChange={() =>
                              setNieuwWinkelApiType(opt.value as 'cyclesoftware' | 'wilmar' | 'vendit' | 'vendit_api')
                            }
                            className="sr-only"
                          />
                          <div
                            className="rounded-xl border-2 p-3 transition"
                            style={
                              nieuwWinkelApiType === opt.value
                                ? { borderColor: DYNAMO_BLUE, background: 'rgba(45,69,124,0.04)' }
                                : { borderColor: 'rgba(45,69,124,0.1)' }
                            }
                          >
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                              {opt.label}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                              {opt.info}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  {nieuwWinkelApiType === 'vendit_api' && (
                    <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)' }}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>🔌 Vendit API credentials</p>
                        <button
                          type="button"
                          onClick={() => testVenditCredentials({
                            api_key: nieuwWinkelVenditApiKey,
                            username: nieuwWinkelVenditApiUsername,
                            password: nieuwWinkelVenditApiPassword,
                          })}
                          disabled={venditTestLoading || !nieuwWinkelVenditApiKey.trim() || !nieuwWinkelVenditApiUsername.trim() || !nieuwWinkelVenditApiPassword.trim()}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
                          style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', border: '1px solid rgba(22,163,74,0.3)', fontFamily: F }}
                        >
                          {venditTestLoading ? 'Bezig...' : 'Test credentials'}
                        </button>
                      </div>
                      {venditTestResult && (
                        <p className={`text-xs font-medium ${venditTestResult.ok ? 'text-green-600' : 'text-red-600'}`} style={{ fontFamily: F }}>
                          {venditTestResult.ok ? '✓ ' : '✗ '}{venditTestResult.message}
                        </p>
                      )}
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>API Key *</label>
                        <input type="text" placeholder="Vendit API key" value={nieuwWinkelVenditApiKey} onChange={e => { setNieuwWinkelVenditApiKey(e.target.value); setVenditTestResult(null) }} className={inputClass} style={inputStyle} autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Username *</label>
                        <input type="text" placeholder="API username" value={nieuwWinkelVenditApiUsername} onChange={e => { setNieuwWinkelVenditApiUsername(e.target.value); setVenditTestResult(null) }} className={inputClass} style={inputStyle} autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Wachtwoord *</label>
                        <input type="password" placeholder="API wachtwoord" value={nieuwWinkelVenditApiPassword} onChange={e => { setNieuwWinkelVenditApiPassword(e.target.value); setVenditTestResult(null) }} className={inputClass} style={inputStyle} autoComplete="new-password" />
                      </div>
                    </div>
                  )}
                  {formError && <p className="text-sm" style={{ color: '#dc2626', fontFamily: F }}>{formError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={winkelLoading} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: DYNAMO_BLUE, fontFamily: F }}>{winkelLoading ? 'Bezig...' : 'Toevoegen'}</button>
                    <button type="button" onClick={() => { setToonWinkelForm(false); setFormError('') }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70" style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            {isAdmin && bewerkWinkel && (
              <div className="rounded-[10px] p-5" style={{ background: 'var(--drg-card)', border: '2px solid var(--drg-ink-2)', boxShadow: 'var(--drg-card-shadow)' }}>
                <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--drg-ink)', fontFamily: F }}>✏️ {bewerkWinkel.naam} bewerken</h2>
                <form onSubmit={slaWinkelOp} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Naam *</label>
                      <input value={bewerkWinkel.naam} onChange={e => setBewerkWinkel({ ...bewerkWinkel, naam: e.target.value })} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Kassanummer *</label>
                      <input value={bewerkWinkel.kassa_nummer} onChange={e => setBewerkWinkel({ ...bewerkWinkel, kassa_nummer: e.target.value })} className={inputClass} style={inputStyle} required />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Lidnummer</label>
                      <input value={bewerkWinkel.lidnummer ?? ''} readOnly className={inputClass} style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }} placeholder="—" />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs font-semibold mb-1" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Adres (postcode + huisnummer → Haal adres op)</div>
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[100px]">
                          <input placeholder="Postcode" value={bewerkWinkel.postcode ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, postcode: e.target.value })} className={inputClass} style={inputStyle} />
                        </div>
                        <div className="w-24">
                          <input placeholder="Nr." value={bewerkHuisnummer} onChange={e => setBewerkHuisnummer(e.target.value)} className={inputClass} style={inputStyle} />
                        </div>
                        <button type="button" onClick={() => haalAdresOp(false)} disabled={adresLoading} className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50" style={{ background: 'rgba(45,69,124,0.08)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.12)', fontFamily: F }}>
                          {adresLoading ? 'Bezig...' : 'Haal adres op'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Straat</label>
                      <input placeholder="Straat" value={bewerkWinkel.straat ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, straat: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Stad</label>
                      <input value={bewerkWinkel.stad ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, stad: e.target.value })} className={inputClass} style={inputStyle} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Land</label>
                      <select value={bewerkWinkel.land ?? ''} onChange={e => setBewerkWinkel({ ...bewerkWinkel, land: (e.target.value || null) as 'Netherlands' | 'Belgium' | null })} className={inputClass} style={inputStyle}>
                        <option value="">— Niet gekozen</option>
                        <option value="Netherlands">🇳🇱 Nederland</option>
                        <option value="Belgium">🇧🇪 België</option>
                      </select>
                    </div>
                  </div>

                  {/* Systeemkeuze */}
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(45,69,124,0.02)', border: '1px solid rgba(45,69,124,0.08)' }}>
                    <p className="text-xs font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Systeem</p>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { value: 'cyclesoftware' as const, label: 'CycleSoftware', info: 'Gebruik dealer nummer voor voorraad' },
                        { value: 'wilmar' as const, label: 'Wilmar', info: 'Gebruik Wilmar koppeling (branch/organisation)' },
                        { value: 'vendit' as const, label: 'Vendit', info: 'Voorraad uit Supabase vendit_stock (dealer nummer)' },
                        { value: 'vendit_api' as const, label: 'Vendit API', info: 'Vendit Public API met eigen credentials' },
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
                            onChange={() => {
                              setBewerkWinkel({ ...bewerkWinkel, api_type: opt.value })
                              if (opt.value !== 'wilmar') {
                                setWilmarBranchId(null)
                                setWilmarOrganisationId(null)
                              } else {
                                setWilmarBranchId(bewerkWinkel.wilmar_branch_id ?? null)
                                setWilmarOrganisationId(bewerkWinkel.wilmar_organisation_id ?? null)
                              }
                            }}
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
                                ? { borderColor: DYNAMO_BLUE, background: 'rgba(45,69,124,0.04)' }
                                : { borderColor: 'rgba(45,69,124,0.1)' }
                            }
                          >
                            <div className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                              {opt.label}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                              {opt.info}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Vendit API toegang (alleen bij api_type vendit_api) */}
                  {(bewerkWinkel.api_type ?? 'cyclesoftware') === 'vendit_api' && (
                    <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.15)' }}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-xs font-bold" style={{ color: '#2563eb', fontFamily: F }}>🔌 Vendit API toegang</p>
                          <p className="text-xs mb-0" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>Credentials voor de Vendit Public API. Gebruik in module Vendit API Tester.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const key = (bewerkWinkel.vendit_api_key ?? '').trim()
                            const user = (bewerkWinkel.vendit_api_username ?? '').trim()
                            const pass = (bewerkWinkel.vendit_api_password ?? '').trim()
                            if (key && user && pass) {
                              testVenditCredentials({ api_key: key, username: user, password: pass })
                            } else if (bewerkWinkel.id) {
                              testVenditCredentials({ winkel_id: bewerkWinkel.id })
                            }
                          }}
                          title={(!((bewerkWinkel.vendit_api_key ?? '').trim() && (bewerkWinkel.vendit_api_username ?? '').trim() && (bewerkWinkel.vendit_api_password ?? '').trim()) && bewerkWinkel.id) ? 'Test opgeslagen credentials' : 'Test ingevulde credentials'}
                          disabled={venditTestLoading || (!((bewerkWinkel.vendit_api_key ?? '').trim() && (bewerkWinkel.vendit_api_username ?? '').trim() && (bewerkWinkel.vendit_api_password ?? '').trim()) && !bewerkWinkel.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0"
                          style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', border: '1px solid rgba(22,163,74,0.3)', fontFamily: F }}
                        >
                          {venditTestLoading ? 'Bezig...' : 'Test credentials'}
                        </button>
                      </div>
                      {venditTestResult && (
                        <p className={`text-xs font-medium ${venditTestResult.ok ? 'text-green-600' : 'text-red-600'}`} style={{ fontFamily: F }}>
                          {venditTestResult.ok ? '✓ ' : '✗ '}{venditTestResult.message}
                        </p>
                      )}
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>API Key</label>
                        <input type="text" placeholder="Vendit API key" value={bewerkWinkel.vendit_api_key ?? ''} onChange={e => { setBewerkWinkel({ ...bewerkWinkel, vendit_api_key: e.target.value }); setVenditTestResult(null) }} className={inputClass} style={inputStyle} autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Username</label>
                        <input type="text" placeholder="API username" value={bewerkWinkel.vendit_api_username ?? ''} onChange={e => { setBewerkWinkel({ ...bewerkWinkel, vendit_api_username: e.target.value }); setVenditTestResult(null) }} className={inputClass} style={inputStyle} autoComplete="off" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Wachtwoord</label>
                        <input type="password" placeholder="Laat leeg om niet te wijzigen" value={bewerkWinkel.vendit_api_password ?? ''} onChange={e => { setBewerkWinkel({ ...bewerkWinkel, vendit_api_password: e.target.value }); setVenditTestResult(null) }} className={inputClass} style={inputStyle} autoComplete="new-password" />
                      </div>
                    </div>
                  )}

                  {/* Wilmar koppeling */}
                  <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(45,69,124,0.03)', border: '1px solid rgba(45,69,124,0.08)' }}>
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
                        <label className="text-xs font-semibold mb-1 block" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Koppel aan Wilmar winkel</label>
                        <input
                          type="text"
                          placeholder="Zoek op naam of stad..."
                          value={wilmarZoekterm}
                          onChange={e => setWilmarZoekterm(e.target.value)}
                          className={inputClass}
                          style={inputStyle}
                        />
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border" style={{ borderColor: 'rgba(45,69,124,0.1)' }}>
                          {gefilterdeWilmarStores.length === 0 ? (
                            <div className="p-4 text-center text-xs" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
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
                                    background: isGeselecteerd ? 'rgba(45,69,124,0.08)' : 'transparent',
                                    color: isGeselecteerd ? DYNAMO_BLUE : 'rgba(45,69,124,0.8)',
                                    borderBottom: '1px solid rgba(45,69,124,0.05)',
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
                    <button type="button" onClick={() => { setBewerkWinkel(null); setWilmarBranchId(null); setWilmarOrganisationId(null); setFormError(''); setVenditTestResult(null) }} className="rounded-xl px-4 py-2.5 text-sm font-semibold hover:opacity-70" style={{ border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Annuleren</button>
                  </div>
                </form>
              </div>
            )}

            <div className="rounded-[10px] overflow-hidden" style={{ background: 'var(--drg-card-bg)', border: '1px solid var(--drg-card-border)', boxShadow: 'var(--drg-card-shadow)' }}>
              <div className="p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(45,69,124,0.07)', borderTop: `3px solid ${DYNAMO_BLUE}` }}>
                <div className="min-w-0">
                  <div className="text-sm font-bold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>Winkeloverzicht</div>
                  <div className="text-xs" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>{loading ? 'Laden...' : `${gefilterdeWinkels.length} van ${winkels.length} winkels`}</div>
                </div>
                <button onClick={verversWinkels} disabled={winkelRefreshLoading || loading} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0 flex items-center gap-1.5" style={{ background: 'rgba(45,69,124,0.06)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }} title="Winkels opnieuw laden">
                  {winkelRefreshLoading ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Ververs...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                      Ververs
                    </>
                  )}
                </button>
                <input
                  type="text"
                  placeholder="Zoek op naam, stad, dealer, straat..."
                  value={winkelZoekterm}
                  onChange={e => setWinkelZoekterm(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs w-full sm:w-56"
                  style={{ background: 'rgba(45,69,124,0.04)', border: '1px solid rgba(45,69,124,0.1)', color: DYNAMO_BLUE, fontFamily: F, outline: 'none' }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select value={winkelFilterLand} onChange={e => setWinkelFilterLand(e.target.value as any)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                    <option value="alle">Alle landen</option>
                    <option value="Netherlands">🇳🇱 Nederland</option>
                    <option value="Belgium">🇧🇪 België</option>
                  </select>
                  <select value={winkelFilterLocatie} onChange={e => setWinkelFilterLocatie(e.target.value as any)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                    <option value="alle">Alle locaties</option>
                    <option value="zonder">📍 Zonder locatie</option>
                  </select>
                  <select value={winkelFilterSysteem} onChange={e => { const v = e.target.value as any; setWinkelFilterSysteem(v); setWinkelFilterApi('alle') }} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                    <option value="alle">Alle systemen</option>
                    <option value="cyclesoftware">CycleSoftware</option>
                    <option value="wilmar">Wilmar</option>
                    <option value="vendit">Vendit</option>
                  </select>
                  <select value={winkelFilterApi} onChange={e => setWinkelFilterApi(e.target.value as any)} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(45,69,124,0.04)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                    {winkelFilterSysteem === 'wilmar' ? (
                      <>
                        <option value="alle">ALLE (toon alle winkels)</option>
                        <option value="gekoppeld">API: Gekoppeld</option>
                        <option value="niet_gekoppeld">API: Nog niet gekoppeld</option>
                      </>
                    ) : winkelFilterSysteem === 'vendit' ? (
                      <>
                        <option value="alle">ALLE (toon alle winkels)</option>
                        <option value="in_dataset">✓ In dataset</option>
                        <option value="niet_in_dataset">— Niet in dataset</option>
                        <option value="ouder_dan_2_dagen">Data ouder dan 2 dagen</option>
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
                {winkelFilterSysteem !== 'wilmar' && winkelFilterSysteem !== 'vendit' && winkels.some(w => (w.api_type === 'cyclesoftware' || (!w.api_type && !w.wilmar_organisation_id && !w.wilmar_branch_id)) && w.kassa_nummer) && (
                  <button onClick={verversCycleApiStatus} disabled={cycleStatusLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0" style={{ background: 'rgba(45,69,124,0.06)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                    {cycleStatusLoading ? 'Bezig...' : 'Ververs API-status'}
                  </button>
                )}
                {winkelFilterSysteem === 'wilmar' && winkels.some(w => (w.api_type === 'wilmar' || !w.api_type) && (!w.wilmar_organisation_id || !w.wilmar_branch_id)) && (
                  <button onClick={wilmarAutoKoppelen} disabled={wilmarAutoLinkLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0" style={{ background: 'rgba(22,163,74,0.1)', color: '#15803d', border: '1px solid rgba(22,163,74,0.25)', fontFamily: F }}>
                    {wilmarAutoLinkLoading ? 'Bezig...' : 'Wilmar auto-koppelen'}
                  </button>
                )}
                {winkels.some(w => !w.lat || !w.lng) && (
                  <button onClick={geocodeerWinkels} disabled={geocodeLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 shrink-0" style={{ background: 'rgba(45,69,124,0.06)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>
                    {geocodeLoading ? 'Geocoderen…' : `📍 Geocodeer winkels zonder locatie (${winkels.filter(w => !w.lat || !w.lng).length})`}
                  </button>
                )}
              </div>
              {geocodeVoortgang && (
                <div className="rounded-[10px] overflow-hidden" style={{ border: '1px solid rgba(45,69,124,0.1)', background: 'var(--drg-card)' }}>
                  {/* Header met voortgangsbalk */}
                  <div className="px-4 py-3 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(45,69,124,0.07)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: DYNAMO_BLUE, fontFamily: F }}>
                          {geocodeVoortgang.klaar ? `Klaar — ${geocodeVoortgang.bijgewerkt} bijgewerkt` : geocodeVoortgang.huidig ? `Bezig: ${geocodeVoortgang.huidig}` : 'Ophalen…'}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(45,69,124,0.45)', fontFamily: F }}>
                          {geocodeVoortgang.gedaan} / {geocodeVoortgang.totaal}
                        </span>
                      </div>
                      <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(45,69,124,0.1)' }}>
                        <div
                          className="h-1.5 rounded-full transition-all duration-300"
                          style={{ width: geocodeVoortgang.totaal > 0 ? `${Math.round((geocodeVoortgang.gedaan / geocodeVoortgang.totaal) * 100)}%` : '0%', background: geocodeVoortgang.klaar ? '#16a34a' : DYNAMO_BLUE }}
                        />
                      </div>
                      {geocodeVoortgang.klaar && (
                        <p className="text-xs mt-1" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>
                          {geocodeVoortgang.mislukt > 0 && `${geocodeVoortgang.mislukt} mislukt · `}
                          {geocodeVoortgang.zonderAdres > 0 && `${geocodeVoortgang.zonderAdres} zonder adres`}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setGeocodeVoortgang(null)} className="text-xs shrink-0" style={{ color: 'rgba(45,69,124,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F }}>✕</button>
                  </div>
                  {/* Log */}
                  {geocodeVoortgang.log.length > 0 && (
                    <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                      {geocodeVoortgang.log.map((r, i) => (
                        <div key={i} className="px-4 py-2 flex items-start gap-2.5" style={{ borderBottom: '1px solid rgba(45,69,124,0.05)', background: r.status === 'mislukt' ? 'rgba(220,38,38,0.03)' : undefined }}>
                          <span className="shrink-0 text-xs font-bold mt-0.5" style={{ color: r.status === 'ok' ? '#16a34a' : r.status === 'mislukt' ? '#b91c1c' : 'rgba(45,69,124,0.35)' }}>
                            {r.status === 'ok' ? '✓' : r.status === 'mislukt' ? '✕' : '—'}
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-medium" style={{ color: r.status === 'mislukt' ? '#b91c1c' : 'var(--drg-ink)', fontFamily: F }}>{r.naam}</span>
                            {r.reden && <p className="text-xs m-0 mt-0.5 break-words" style={{ color: 'rgba(45,69,124,0.5)', fontFamily: F }}>{r.reden}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {loading ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: DYNAMO_BLUE }} />
                  <p className="text-sm font-medium" style={{ color: 'rgba(45,69,124,0.6)', fontFamily: F }}>Winkels laden...</p>
                  <p className="text-xs" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>Vendit- en API-status worden opgehaald</p>
                </div>
              ) : gefilterdeWinkels.length === 0 ? (
                <div className="p-10 text-center text-sm" style={{ color: 'rgba(45,69,124,0.35)', fontFamily: F }}>{winkels.length === 0 ? 'Nog geen winkels' : 'Geen winkels voldoen aan de filter'}</div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'rgba(45,69,124,0.06)' }}>
                  {gefilterdeWinkels.map((w, i) => (
                    <div key={w.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 transition hover:bg-gray-50/50">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: isBikeTotaal(w.naam) ? 'white' : WINKEL_KLEUREN[i % 8], border: isBikeTotaal(w.naam) ? '1px solid rgba(45,69,124,0.1)' : undefined }}>
                        {isBikeTotaal(w.naam) ? <img src={BIKE_TOTAAL_LOGO} alt="" className="w-full h-full object-contain p-1" /> : <span className="text-white text-sm font-bold">{w.naam.charAt(0)}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: DYNAMO_BLUE, fontFamily: F }}>{w.naam}</span>
                          {w.api_type === 'wilmar' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', fontFamily: F }}>Wilmar</span>
                          ) : w.api_type === 'vendit' ? (
                            <>
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(59,130,246,0.15)', color: '#2563eb', fontFamily: F }}>Vendit</span>
                              {w.vendit_in_dataset === true && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', fontFamily: F }} title="Winkel staat in vendit_stock dataset">✓ In dataset</span>
                              )}
                              {w.vendit_in_dataset === false && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(234,179,8,0.2)', color: '#a16207', fontFamily: F }} title={`Geen data beschikbaar: dealer #${w.kassa_nummer ?? ''} komt niet voor in vendit_stock. Controleer of het nummer exact overeenkomt (bijv. 094 ≠ 94).`}>— Niet in dataset</span>
                              )}
                              {w.vendit_in_dataset && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.55)', fontFamily: F }} title={w.vendit_laatst_datum ? 'Laatste datum voorraad in vendit_stock' : 'Geen datum beschikbaar: vendit_stock heeft geen timestamp-kolom of de kolom is leeg'}>
                                  {w.vendit_laatst_datum
                                    ? (() => {
                                        const d = new Date(w.vendit_laatst_datum)
                                        const dag = d.getUTCDate()
                                        const maand = d.toLocaleDateString('nl-NL', { month: 'long', timeZone: 'UTC' })
                                        const jaar = d.getUTCFullYear()
                                        const uur = String(d.getUTCHours()).padStart(2, '0')
                                        const min = String(d.getUTCMinutes()).padStart(2, '0')
                                        return `Laatst: ${dag} ${maand} ${jaar} ${uur}.${min} uur`
                                      })()
                                    : '— Datum onbekend'}
                                </span>
                              )}
                            </>
                          ) : w.api_type === 'vendit_api' ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(99,102,241,0.15)', color: '#4f46e5', fontFamily: F }}>Vendit API</span>
                          ) : (
                            <>
                              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.08)', color: 'rgba(45,69,124,0.5)', fontFamily: F }}>CycleSoftware</span>
                              {w.cycle_api_authorized === true && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(22,163,74,0.15)', color: '#15803d', fontFamily: F }} title="API heeft rechten om voorraad op te halen">✓ API toegang</span>
                              )}
                              {w.cycle_api_authorized === false && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'rgba(234,179,8,0.2)', color: '#a16207', fontFamily: F }} title="Winkel heeft nog geen toestemming gegeven in CycleSoftware">⚠ Geen toestemming</span>
                              )}
                              {w.cycle_api_authorized == null && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(45,69,124,0.06)', color: 'rgba(45,69,124,0.4)', fontFamily: F }} title="Klik op 'Ververs API-status' om te controleren">—</span>
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
                        <div className="text-xs mt-0.5" style={{ color: 'rgba(45,69,124,0.4)', fontFamily: F }}>
                          #{w.kassa_nummer}{w.straat ? ` · ${w.straat}${w.huisnummer ? ` ${w.huisnummer}` : ''}` : ''}{w.stad ? ` · ${w.stad}` : ''}{w.postcode ? ` · ${w.postcode}` : ''}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2 shrink-0 sm:ml-auto">
                          <button onClick={() => startWinkelBewerken(w)} className="rounded-lg px-3 py-1.5 text-xs font-semibold transition hover:opacity-70 flex-1 sm:flex-initial" style={{ background: 'rgba(45,69,124,0.05)', color: DYNAMO_BLUE, border: '1px solid rgba(45,69,124,0.1)', fontFamily: F }}>Bewerken</button>
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
        {tab === 'ips' && <TrustedIpsTab />}

        {/* ── TAB: CAMPAGNEFIETSEN (alleen admin) ── */}
        {tab === 'campagnefietsen' && isAdmin && <CampagneFietsenBeheerTab />}
        {tab === 'nieuws' && (isAdmin || canManageInterneNieuws) && <NieuwsBeheerTab />}
        {tab === 'afbeeldingen' && isAdmin && <PubliekeAfbeeldingenTab />}
        {tab === 'tv' && isAdmin && <TvMededelingenTab />}

        {/* ── TAB: BEKENDE MERKEN (alleen admin) ── */}
        {tab === 'merken' && <BekendeMerkenTab />}

        {/* ── TAB: EXCEL IMPORT ── */}
        {tab === 'import' && <ImportTab winkels={winkels} onRefreshGebruikers={haalGebruikersOp} />}

      </div>
  )
}