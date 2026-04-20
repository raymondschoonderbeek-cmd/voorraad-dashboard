import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Geen auth vereist — volledig publieke route. Proxyt de afbeelding zodat de Supabase-URL verborgen blijft.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('publieke_afbeeldingen')
    .select('storage_path, mime_type')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  const { data: urlData } = supabase.storage
    .from('publieke-afbeeldingen')
    .getPublicUrl(data.storage_path)

  const upstream = await fetch(urlData.publicUrl, { cache: 'no-store' })
  if (!upstream.ok) {
    return NextResponse.json({ error: 'Afbeelding niet beschikbaar' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': data.mime_type || upstream.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  })
}
