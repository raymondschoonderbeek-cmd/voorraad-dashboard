import { createClient } from '@/lib/supabase/server'

export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, supabase, isAdmin: false }
  const { data } = await supabase
    .from('gebruiker_rollen')
    .select('rol')
    .eq('user_id', user.id)
    .single()
  const isAdmin = data?.rol === 'admin'
  return { user, supabase, isAdmin }
}

export async function requireAdmin() {
  const { user, supabase, isAdmin } = await requireAuth()
  if (!user) return { ok: false as const, status: 401 }
  if (!isAdmin) return { ok: false as const, status: 403 }
  return { ok: true as const, user, supabase }
}
