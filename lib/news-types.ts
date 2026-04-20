export type DrgNewsPost = {
  id: string
  title: string
  excerpt: string | null
  body_html: string
  /** Slug van een rij in drg_news_afdelingen (weergavenaam: afdeling). */
  category: string
  is_important: boolean
  toon_op_tv: boolean
  published_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
