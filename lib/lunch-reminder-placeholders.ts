/** Eigen HTML: minstens één link-placeholder ({{loginUrl}} of legacy {{loginMagicUrl}} / {{actionLink}} / {{magicLink}} — allemaal zelfde inlog-URL). */
export function reminderHtmlContainsLoginPlaceholder(html: string): boolean {
  const h = html.trim()
  if (!h) return false
  return (
    h.includes('{{loginUrl}}') ||
    h.includes('{{loginMagicUrl}}') ||
    h.includes('{{actionLink}}') ||
    h.includes('{{magicLink}}')
  )
}
