import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireInterneNieuwsBeheer } from '@/lib/auth'
import { withRateLimit } from '@/lib/api-middleware'
import { createAdminClient, hasAdminKey } from '@/lib/supabase/admin'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
])

/**
 * POST multipart/form-data: veld `file` — JPEG/PNG/GIF/WebP, max 5 MB.
 * Retourneert `{ url }` voor gebruik in body_html (<img src="...">).
 */
export async function POST(request: NextRequest) {
  const rl = withRateLimit(request)
  if (rl) return rl

  const auth = await requireInterneNieuwsBeheer()
  if (!auth.ok) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  if (!hasAdminKey()) {
    return NextResponse.json(
      { error: 'Afbeeldingen uploaden is niet geconfigureerd (SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 }
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Geen bestand (veld file)' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Bestand te groot (max. 5 MB)' }, { status: 400 })

  const type = (file.type || '').toLowerCase()
  const ext = ALLOWED.get(type)
  if (!ext) return NextResponse.json({ error: 'Alleen JPEG, PNG, GIF of WebP' }, { status: 400 })

  const path = `news/${auth.user.id}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Configuratiefout'
    return NextResponse.json({ error: msg }, { status: 503 })
  }

  const { data, error } = await admin.storage.from('drg-news-images').upload(path, buffer, {
    contentType: type,
    upsert: false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: pub } = admin.storage.from('drg-news-images').getPublicUrl(data.path)
  return NextResponse.json({ url: pub.publicUrl })
}
