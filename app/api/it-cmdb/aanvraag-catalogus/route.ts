import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/api-middleware'

/**
 * GET: beschikbare licenties voor zelfaanvraag (Instellingen).
 * Toegankelijk voor elke ingelogde gebruiker.
 * Alleen type=licentie én aanvraagbaar=true (IT beheert dit in IT CMDB → Catalogus).
 */
export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('it_catalogus')
    .select('id, naam, categorie, leverancier, versie, kosten_per_eenheid')
    .eq('type', 'licentie')
    .eq('aanvraagbaar', true)
    .order('naam', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}
