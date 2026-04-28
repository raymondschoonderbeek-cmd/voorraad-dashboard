import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/mededelingen
 * Publiek toegankelijk — TV-weergave toont mededelingen zonder inloggen.
 * Filtert op actief=true en geldigheidsperiode.
 */

export async function GET() {
  const supabase = createAdminClient()
  const vandaag = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('tv_mededelingen')
    .select('id, tekst, sort_order')
    .eq('actief', true)
    .or(`geldig_van.is.null,geldig_van.lte.${vandaag}`)
    .or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
  })
}
