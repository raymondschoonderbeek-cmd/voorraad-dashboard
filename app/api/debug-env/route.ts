import { NextResponse } from 'next/server'
import { hasAdminKey } from '@/lib/supabase/admin'

/**
 * Debug endpoint om te controleren of env vars geladen zijn.
 * Alleen in development. Verwijder in productie.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Niet beschikbaar in productie' }, { status: 404 })
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  return NextResponse.json({
    hasAdminKey: hasAdminKey(),
    supabaseUrl: !!url,
    serviceRoleKeyPresent: !!key,
    serviceRoleKeyLength: key ? String(key).length : 0,
    hint: !key
      ? 'SUPABASE_SERVICE_ROLE_KEY ontbreekt. Voeg toe aan .env.local en herstart (rm -rf .next && npm run dev).'
      : key.length < 20
        ? 'Key lijkt te kort. Kopieer de volledige service_role key uit Supabase.'
        : 'Key OK',
  })
}
