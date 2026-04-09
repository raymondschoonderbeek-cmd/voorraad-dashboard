import { NextRequest, NextResponse } from 'next/server'
import { requireItCmdbAccess } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

const VALID_TYPES = ['product', 'licentie'] as const
type CatalogusType = (typeof VALID_TYPES)[number]

function isValidType(v: unknown): v is CatalogusType {
  return typeof v === 'string' && (VALID_TYPES as readonly string[]).includes(v)
}

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { data, error } = await auth.supabase
    .from('it_catalogus')
    .select('*, it_catalogus_gebruikers(count)')
    .order('naam', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Supabase geeft it_catalogus_gebruikers terug als [{ count: N }]; we maken er een plat getal van
  const items = (data ?? []).map((row: Record<string, unknown>) => {
    const countArr = row.it_catalogus_gebruikers
    const in_gebruik = Array.isArray(countArr) && countArr.length > 0
      ? Number((countArr[0] as { count: unknown }).count ?? 0)
      : 0
    const { it_catalogus_gebruikers: _, ...rest } = row
    return { ...rest, in_gebruik }
  })

  return NextResponse.json({ items })
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireItCmdbAccess()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const naam = typeof body.naam === 'string' ? body.naam.trim() : ''
  if (!naam) return NextResponse.json({ error: 'naam is verplicht' }, { status: 400 })
  if (!isValidType(body.type)) return NextResponse.json({ error: 'type moet "product" of "licentie" zijn' }, { status: 400 })
  const categorie = typeof body.categorie === 'string' ? body.categorie.trim() : ''
  if (!categorie) return NextResponse.json({ error: 'categorie is verplicht' }, { status: 400 })
  const leverancier = typeof body.leverancier === 'string' ? body.leverancier.trim() : ''
  if (!leverancier) return NextResponse.json({ error: 'leverancier is verplicht' }, { status: 400 })

  const aantallen = typeof body.aantallen === 'number' ? body.aantallen : (body.aantallen != null ? parseInt(String(body.aantallen), 10) : null)
  const kostenRaw = typeof body.kosten_per_eenheid === 'number' ? body.kosten_per_eenheid : (body.kosten_per_eenheid != null ? parseFloat(String(body.kosten_per_eenheid)) : null)

  const row = {
    naam,
    type: body.type,
    categorie,
    leverancier,
    versie: typeof body.versie === 'string' ? body.versie.trim() || null : null,
    aantallen: aantallen != null && !Number.isNaN(aantallen) ? aantallen : null,
    kosten_per_eenheid: kostenRaw != null && !Number.isNaN(kostenRaw) ? kostenRaw : null,
    notities: typeof body.notities === 'string' ? body.notities.trim() || null : null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await auth.supabase.from('it_catalogus').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
