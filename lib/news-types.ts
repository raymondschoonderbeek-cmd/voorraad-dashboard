export type DrgNewsPost = {
  id: string
  title: string
  excerpt: string | null
  body_html: string
  category: string
  is_important: boolean
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const DRG_NEWS_CATEGORIES = ['algemeen', 'hr', 'winkel', 'it', 'organisatie'] as const
export type DrgNewsCategory = (typeof DRG_NEWS_CATEGORIES)[number]

export function isDrgNewsCategory(s: string): s is DrgNewsCategory {
  return (DRG_NEWS_CATEGORIES as readonly string[]).includes(s)
}
