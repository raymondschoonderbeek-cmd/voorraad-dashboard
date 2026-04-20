import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'

async function isAdmin(supabase: Awaited<ReturnType<typeof requireAuth>>['supabase'], userId: string) {
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', userId)
    .eq('rol', 'admin')
    .maybeSingle()
  return !!data
}

export async function GET(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isAdmin(supabase, user.id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { data, error } = await supabase
    .from('publieke_afbeeldingen')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ afbeeldingen: data })
}

export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isAdmin(supabase, user.id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: { naam: string; slug: string; storage_path: string; mime_type: string; breedte?: number; hoogte?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }) }

  const { naam, slug, storage_path, mime_type, breedte, hoogte } = body
  if (!naam || !slug || !storage_path) return NextResponse.json({ error: 'naam, slug en storage_path zijn verplicht' }, { status: 400 })

  const { data, error } = await supabase
    .from('publieke_afbeeldingen')
    .insert({ naam, slug, storage_path, mime_type, breedte: breedte ?? null, hoogte: hoogte ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ afbeelding: data })
}

export async function PATCH(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isAdmin(supabase, user.id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  let body: { id: string; naam?: string; breedte?: number | null; hoogte?: number | null; storage_path?: string; mime_type?: string; oud_storage_path?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }) }

  const { id, oud_storage_path, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id verplicht' }, { status: 400 })

  const { data, error } = await supabase
    .from('publieke_afbeeldingen')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Verwijder oude afbeelding uit storage als die vervangen is
  if (oud_storage_path && updates.storage_path && oud_storage_path !== updates.storage_path) {
    await supabase.storage.from('publieke-afbeeldingen').remove([oud_storage_path])
  }

  return NextResponse.json({ afbeelding: data })
}

export async function DELETE(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl
  const { user, supabase } = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  if (!(await isAdmin(supabase, user.id))) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id verplicht' }, { status: 400 })

  const { data: row } = await supabase.from('publieke_afbeeldingen').select('storage_path').eq('id', id).maybeSingle()
  if (row?.storage_path) {
    await supabase.storage.from('publieke-afbeeldingen').remove([row.storage_path])
  }

  const { error } = await supabase.from('publieke_afbeeldingen').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
