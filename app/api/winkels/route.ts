import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('winkels')
    .select('*')
    .order('naam')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

async function haalCoordsOp(postcode: string) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postcode)}&country=NL&format=json&limit=1`,
      { headers: { 'User-Agent': 'DynamoRetailDashboard/1.0' } }
    )
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch (e) {
    console.error('Geocoding mislukt:', e)
  }
  return { lat: null, lng: null }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { naam, dealer_nummer, postcode, stad } = body

  if (!naam || !dealer_nummer) {
    return NextResponse.json({ error: 'Naam en dealer nummer zijn verplicht' }, { status: 400 })
  }

  const { lat, lng } = postcode ? await haalCoordsOp(postcode) : { lat: null, lng: null }

  const { data, error } = await supabase
    .from('winkels')
    .insert([{ naam, dealer_nummer, postcode: postcode ?? null, stad: stad ?? null, lat, lng }])
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data[0])
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { id, naam, dealer_nummer, postcode, stad, wilmar_organisation_id, wilmar_branch_id } = body

  if (!id) return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })

  const { lat, lng } = postcode ? await haalCoordsOp(postcode) : { lat: null, lng: null }

  const updateData: any = {
    naam,
    dealer_nummer,
    postcode: postcode || null,
    stad: stad || null,
    lat,
    lng,
    wilmar_organisation_id: wilmar_organisation_id ?? null,
    wilmar_branch_id: wilmar_branch_id ?? null,
  }

  console.log('PUT winkels updateData:', updateData)

  const { error } = await supabase
    .from('winkels')
    .update(updateData)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID is verplicht' }, { status: 400 })
  const { error } = await supabase
    .from('winkels')
    .delete()
    .eq('id', Number(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
