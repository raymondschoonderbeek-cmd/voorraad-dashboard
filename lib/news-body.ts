const BLOCK_TAG = /<(p|br|div|ul|ol|li|h[1-6]|blockquote|hr|table)\b/i

/**
 * Als body_html geen block-level HTML-tags bevat (= plain tekst met enters),
 * worden dubbele enters omgezet naar <p>-tags en enkele enters naar <br>.
 * Echte HTML wordt ongewijzigd teruggegeven.
 */
export function normalizeBodyHtml(html: string | null | undefined): string {
  if (!html?.trim()) return ''
  if (BLOCK_TAG.test(html)) return html
  return html
    .split(/\n{2,}/)
    .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
    .filter(p => p !== '<p></p>')
    .join('')
}
