/** Eigen HTML: minstens één link-placeholder (portal-login om magic link aan te vragen, of directe magic link uit de mail). */
export function reminderHtmlContainsMagicLinkPlaceholder(html: string): boolean {
  const h = html.trim()
  if (!h) return false
  return (
    h.includes('{{loginMagicUrl}}') ||
    h.includes('{{actionLink}}') ||
    h.includes('{{magicLink}}')
  )
}
