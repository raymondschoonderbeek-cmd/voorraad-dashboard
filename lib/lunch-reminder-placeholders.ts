/** Eigen HTML moet minstens één van deze bevatten (Supabase magic link, geen wachtwoord). */
export function reminderHtmlContainsMagicLinkPlaceholder(html: string): boolean {
  const h = html.trim()
  if (!h) return false
  return h.includes('{{actionLink}}') || h.includes('{{magicLink}}')
}
