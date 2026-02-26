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

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { naam, dealer_nummer, postcode, stad } = body

  if (!naam || !dealer_nummer) {
    return NextResponse.json({ error: 'Naam en dealer nummer zijn verplicht' }, { status: 400 })
  }

  // Coördinaten ophalen via postcode
  let lat = null
  let lng = null

  if (postcode) {
    try {
      const geo = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postcode)}&country=NL&format=json&limit=1`,
        { headers: { 'User-Agent': 'DynamoRetailDashboard/1.0' } }
      )
      const geoData = await geo.json()
      if (geoData.length > 0) {
        lat = parseFloat(geoData[0].lat)
        lng = parseFloat(geoData[0].lon)
      }
    } catch (e) {
      console.error('Geocoding mislukt:', e)
    }
  }

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
  const { id, naam, dealer_nummer, postcode, stad } = body

  // Coördinaten opnieuw ophalen als postcode gewijzigd
  let lat = null
  let lng = null

  if (postcode) {
    try {
      const geo = await fetch(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postcode)}&country=NL&format=json&limit=1`,
        { headers: { 'User-Agent': 'DynamoRetailDashboard/1.0' } }
      )
      const geoData = await geo.json()
      if (geoData.length > 0) {
        lat = parseFloat(geoData[0].lat)
        lng = parseFloat(geoData[0].lon)
      }
    } catch (e) {
      console.error('Geocoding mislukt:', e)
    }
  }

  const { data, error } = await supabase
    .from('winkels')
    .update({ naam, dealer_nummer, postcode: postcode ?? null, stad: stad ?? null, lat, lng })
    .eq('id', id)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data[0])
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { error } = await supabase
    .from('winkels')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}