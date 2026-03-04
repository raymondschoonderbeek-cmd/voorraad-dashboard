import { createClient } from '@supabase/supabase-js'

/**
 * Admin client met service role key voor server-side admin operaties.
 * Alleen gebruiken in API routes, nooit in de browser.
 * Vereist: SUPABASE_SERVICE_ROLE_KEY in env
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY ontbreekt voor admin operaties')
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
