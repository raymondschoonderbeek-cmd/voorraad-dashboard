import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

const WILMAR_BASE = 'https://api.v2.wilmarinfo.nl'

async function getWilmarToken(): Promise<string> {
  const res = await fetch(`${WILMAR_BASE}/api/v1/Account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.WILMAR_API_KEY!,
      password: process.env.WILMAR_PASSWORD!,
    }),
  })
  if (!res.ok) throw new Error('Wilmar login mislukt')
  const data = await res.json()
  return data.accessToken
}

function nor(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function naamMatch(winkelNaam: string, wilmarName: string): boolean {
  const a = nor(winkelNaam)
  const b = nor(wilmarName)
  if (a.length < 2 || b.length < 2) return false
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const aWords = a.split(/\s+/).filter(Boolean)
  const bWords = b.split(/\s+/).filter(Boolean)
  const overlap = aWords.filter(w => bWords.some(bw => bw.includes(w) || w.includes(bw))).length
  return overlap >= Math.min(2, aWords.length, bWords.length)
}

function stadMatch(winkelStad: string | null | undefined, wilmarCity: string | null | undefined): boolean {
  const a = nor(winkelStad)
  const b = nor(wilmarCity)
  if (!a || !b) return true
  return a === b || a.includes(b) || b.includes(a)
}

/** Auto-koppel winkels aan Wilmar stores op basis van naam en stad. Alleen admin. */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Geen toegang' }, { status: auth.status })
  const { supabase } = auth

  let token: string
  try {
    token = await getWilmarToken()
  } catch {
    return NextResponse.json({ error: 'Wilmar API niet bereikbaar' }, { status: 502 })
  }

  const res = await fetch(`${WILMAR_BASE}/api/v1/Stores/all`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return NextResponse.json({ error: 'Wilmar winkels ophalen mislukt' }, { status: 502 })

  const data = await res.json()
  const list = Array.isArray(data) ? data : (data?.data ?? data?.stores ?? [])
  const wilmarStores = list
    .map((s: any) => ({
      branchId: s.branchId ?? s.BranchId ?? s.branch_id ?? s.id,
      organisationId: s.organisationId ?? s.OrganisationId ?? s.organisation_id ?? s.organizationId ?? s.OrganizationId,
      name: String(s.name ?? s.Name ?? s.branchName ?? s.BranchName ?? ''),
      city: String(s.city ?? s.City ?? s.location ?? s.Location ?? ''),
    }))
    .filter((s: any) => s.branchId != null && s.organisationId != null)

  const { data: winkels } = await supabase.from('winkels').select('id, naam, stad, api_type, wilmar_organisation_id, wilmar_branch_id')
  const zonderLink = (winkels ?? []).filter((w: any) =>
    (w.api_type === 'wilmar' || !w.api_type) &&
    (!w.wilmar_organisation_id || !w.wilmar_branch_id)
  )

  const gekoppeld: { winkel_id: number; winkel_naam: string; wilmar_naam: string }[] = []
  const gebruikt = new Set<string>()

  for (const w of zonderLink) {
    let beste: { org: number; branch: number; name: string; city: string } | null = null
    for (const s of wilmarStores) {
      const key = `${s.organisationId}-${s.branchId}`
      if (gebruikt.has(key)) continue
      if (!naamMatch(w.naam, s.name)) continue
      if (!stadMatch(w.stad, s.city)) continue
      beste = { org: s.organisationId, branch: s.branchId, name: s.name, city: s.city }
      break
    }
    if (beste) {
      const wilmarNaam = beste.city ? `${beste.name} (${beste.city})` : beste.name
      await supabase
        .from('winkels')
        .update({
          wilmar_organisation_id: beste.org,
          wilmar_branch_id: beste.branch,
          wilmar_store_naam: wilmarNaam,
          api_type: 'wilmar',
        })
        .eq('id', w.id)
      gekoppeld.push({ winkel_id: w.id, winkel_naam: w.naam, wilmar_naam: wilmarNaam })
      gebruikt.add(`${beste.org}-${beste.branch}`)
    }
  }

  return NextResponse.json({ gekoppeld: gekoppeld.length, overzicht: gekoppeld })
}
