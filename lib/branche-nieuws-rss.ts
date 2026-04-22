/** RSS parsing voor NieuwsFiets (WordPress); geen externe XML-parser nodig. */

export type BrancheNieuwsItem = {
  title: string
  link: string
  pubDate: string | null
  description: string | null
  content: string | null
}

function decodeXmlEntities(s: string): string {
  if (!s) return s
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function extractTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i')
  const c = block.match(cdata)
  if (c) return decodeXmlEntities(c[1].trim())
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const p = block.match(plain)
  if (!p) return ''
  const inner = p[1].replace(/<[^>]+>/g, '').trim()
  return decodeXmlEntities(inner)
}

/**
 * Parseert RSS 2.0 XML tot titel/link/pubDate per item.
 * @param limit max aantal items (default 8)
 */
function extractContentEncoded(block: string): string {
  const cdata = block.match(/<content:encoded>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content:encoded>/i)
  if (cdata) return decodeXmlEntities(cdata[1].trim())
  const plain = block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)
  if (!plain) return ''
  return decodeXmlEntities(plain[1].replace(/<[^>]+>/g, '').trim())
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function parseBrancheNieuwsRss(xml: string, limit = 8): BrancheNieuwsItem[] {
  const out: BrancheNieuwsItem[] = []
  const re = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null && out.length < limit) {
    const block = m[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link').trim()
    const pubRaw = extractTag(block, 'pubDate')
    const pubDate = pubRaw || null
    const descRaw = extractTag(block, 'description')
    const description = descRaw ? descRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) || null : null
    const contentRaw = extractContentEncoded(block)
    const content = contentRaw ? htmlToText(contentRaw) || null : null
    if (title && link.startsWith('http')) {
      out.push({ title, link, pubDate, description, content })
    }
  }
  return out
}
