import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { parseGazelleDescription } from '@/lib/gazelle-parser'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('gazelle_pakket_orders')
    .select('*')
    .order('ontvangen_op', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: auth.status })

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

  const body = await request.json() as { status?: string; reparse?: boolean }

  if (body.reparse) {
    const { data: order } = await auth.supabase
      .from('gazelle_pakket_orders')
      .select('raw_description')
      .eq('id', id)
      .single()

    if (!order?.raw_description) {
      return NextResponse.json({ error: 'Geen raw_description beschikbaar' }, { status: 422 })
    }

    const parsed = parseGazelleDescription(order.raw_description)
    const { error } = await auth.supabase
      .from('gazelle_pakket_orders')
      .update({
        besteldatum: parsed.besteldatum,
        bestelnummer: parsed.bestelnummer,
        naam: parsed.naam,
        bedrijfsnaam: parsed.bedrijfsnaam,
        emailadres: parsed.emailadres,
        referentie: parsed.referentie,
        opmerkingen: parsed.opmerkingen,
        adres: parsed.adres,
        producten: parsed.producten,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, producten: parsed.producten.length })
  }

  if (!body.status) return NextResponse.json({ error: 'status of reparse vereist' }, { status: 400 })

  const { error } = await auth.supabase
    .from('gazelle_pakket_orders')
    .update({ status: body.status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
