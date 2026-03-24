import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin()
  const { searchParams } = new URL(request.url)
  const includeInactive = admin.ok && searchParams.get('all') === '1'

  let q = supabase.from('campagne_fietsen').select('*').order('merk', { ascending: true }).order('omschrijving_fiets', { ascending: true })
  if (!includeInactive) q = q.eq('active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: 'Forbidden' }, { status: admin.status })

  try {
    const body = await request.json().catch(() => ({}))
    const merk = String(body.merk ?? '').trim()
    const omschrijving_fiets = String(body.omschrijving_fiets ?? '').trim()
    const ean_code = String(body.ean_code ?? '').trim()
    const bestelnummer_leverancier = String(body.bestelnummer_leverancier ?? '').trim()
    const kleur = String(body.kleur ?? '').trim()
    const framemaat = String(body.framemaat ?? '').trim()
    const foto_url = String(body.foto_url ?? '').trim()
    const active = body.active !== false

    if (!ean_code) {
      return NextResponse.json({ error: 'EAN/barcode is verplicht' }, { status: 400 })
    }

    const { data, error } = await admin.supabase
      .from('campagne_fietsen')
      .insert({
        merk,
        omschrijving_fiets,
        ean_code,
        bestelnummer_leverancier,
        kleur,
        framemaat,
        foto_url,
        active,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Ongeldige body' }, { status: 400 })
  }
}
