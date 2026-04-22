import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { slugifyAfdelingLabel, type DrgNewsAfdeling } from '@/lib/news-afdelingen'

/**
 * GET: alle afdelingen (gesorteerd) — iedereen ingelogd (filters / tonen).
 * Voegt automatisch distinct afdelingen uit gebruiker_rollen (Azure sync) toe.
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data, error }, { data: rollenData }] = await Promise.all([
    supabase
      .from('drg_news_afdelingen')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true }),
    supabase
      .from('gebruiker_rollen')
      .select('afdeling')
      .not('afdeling', 'is', null),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bestaandeAfdelingen = (data ?? []) as DrgNewsAfdeling[]
  const bestaandeSlugs = new Set(bestaandeAfdelingen.map(a => a.slug))

  // Distinct Azure-afdelingen die nog niet in drg_news_afdelingen staan
  const azureLabels = [...new Set(
    (rollenData ?? [])
      .map((r: { afdeling: string | null }) => r.afdeling?.trim())
      .filter((a): a is string => !!a)
  )]

  const extraAfdelingen: DrgNewsAfdeling[] = azureLabels
    .map(label => {
      const slug = slugifyAfdelingLabel(label)
      if (!slug || bestaandeSlugs.has(slug)) return null
      return {
        id: `azure-${slug}`,
        slug,
        label,
        sort_order: 999,
        created_at: '',
        updated_at: '',
      } satisfies DrgNewsAfdeling
    })
    .filter((a): a is DrgNewsAfdeling => a !== null)
    .sort((a, b) => a.label.localeCompare(b.label, 'nl'))

  return NextResponse.json({ afdelingen: [...bestaandeAfdelingen, ...extraAfdelingen] })
}

/**
 * POST: nieuwe afdeling (alleen nieuwsbeheer).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label) return NextResponse.json({ error: 'label is verplicht' }, { status: 400 })

  let slug =
    typeof body.slug === 'string' && body.slug.trim() !== ''
      ? slugifyAfdelingLabel(body.slug)
      : slugifyAfdelingLabel(label)
  if (!slug) return NextResponse.json({ error: 'Kon geen geldige slug afleiden. Gebruik letters en cijfers.' }, { status: 400 })

  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0

  const { data: existing } = await auth.supabase.from('drg_news_afdelingen').select('slug').eq('slug', slug).maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `Slug "${slug}" bestaat al.` }, { status: 409 })
  }

  const { data, error } = await auth.supabase
    .from('drg_news_afdelingen')
    .insert({
      slug,
      label,
      sort_order,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ afdeling: data as DrgNewsAfdeling })
}
