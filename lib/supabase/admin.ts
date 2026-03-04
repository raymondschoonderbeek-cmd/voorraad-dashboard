import { createClient } from '@supabase/supabase-js'

/** Controleer of de service role key beschikbaar is */
export function hasAdminKey(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return !!(url && key && String(key).trim().length > 20)
}

/**
 * Admin client met service role key voor server-side admin operaties.
 * Alleen gebruiken in API routes, nooit in de browser.
 * Vereist: SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase Dashboard → Project Settings → API → service_role)
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key || key.length < 20) {
    const hint = !key
      ? 'Variabele is leeg of niet geladen. Controleer: 1) Exacte naam SUPABASE_SERVICE_ROLE_KEY 2) Geen spaties rond = 3) Herstart dev server (rm -rf .next && npm run dev)'
      : 'Key lijkt onvolledig (te kort). Kopieer de volledige service_role key uit Supabase.'
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY ontbreekt. ${hint}`)
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
