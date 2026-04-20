import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Geen auth vereist — volledig publieke route
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('publieke_afbeeldingen')
    .select('storage_path')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  const { data: urlData } = supabase.storage
    .from('publieke-afbeeldingen')
    .getPublicUrl(data.storage_path)

  return NextResponse.redirect(urlData.publicUrl, {
    status: 302,
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  })
}
