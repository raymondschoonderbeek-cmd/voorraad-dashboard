import type { SupabaseClient } from '@supabase/supabase-js'

export type DrgNewsAfdeling = {
  id: string
  slug: string
  label: string
  sort_order: number
  created_at: string
  updated_at: string
}

/** Maak een slug voor nieuwe afdelingen (alleen kleine letters, cijfers, koppelteken). */
export function slugifyAfdelingLabel(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s.slice(0, 64)
}

export async function isValidNewsAfdelingSlug(
  supabase: Pick<SupabaseClient, 'from'>,
  slug: string
): Promise<boolean> {
  const t = slug.trim()
  if (!t) return false
  const { data } = await supabase.from('drg_news_afdelingen').select('slug').eq('slug', t).maybeSingle()
  return !!data
}
