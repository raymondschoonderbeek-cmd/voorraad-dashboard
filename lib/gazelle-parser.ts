export type GazelleProduct = {
  lev_nr: string
  omschrijving: string
  gewenste_leverweek: string
  aantal: string
  ve: string
  totaal_stuks: string
}

export type GazelleParsed = {
  besteldatum: string | null
  bestelnummer: string | null
  naam: string | null
  bedrijfsnaam: string | null
  emailadres: string | null
  referentie: string | null
  opmerkingen: string | null
  adres: string | null
  producten: GazelleProduct[]
}

function stripHtml(html: string): string {
  // <br> binnen table cells naar spatie — anders breekt "Pakket A<br>geen" de kolom-detectie
  const normalized = html.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, content: string) =>
    `<td>${content.replace(/<br\s*\/?>/gi, ' ')}</td>`
  )
  return normalized
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/th>/gi, '\t')
    .replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractField(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escaped}\\s*:?\\s*([^\n\t]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseProducten(text: string): GazelleProduct[] {
  const lines = text.split('\n').map(l => l.trim())
  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes('lev.nr') || l.toLowerCase().includes('omschrijving')
  )
  if (headerIdx < 0) return []

  const producten: GazelleProduct[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    if (
      line.toLowerCase().includes('vriendelijke groet') ||
      line.toLowerCase().includes('klik hier') ||
      line.toLowerCase().includes('afmelden')
    ) break
    const cols = line.split('\t').map(c => c.trim())
    if (cols.length >= 2 && cols[0]) {
      producten.push({
        lev_nr: cols[0] ?? '',
        omschrijving: cols[1] ?? '',
        gewenste_leverweek: cols[2] ?? '',
        aantal: cols[3] ?? '',
        ve: cols[4] ?? '',
        totaal_stuks: cols[5] ?? '',
      })
    }
  }
  return producten
}

function parseAdres(text: string): string {
  const start = text.toLowerCase().indexOf('adresinformatie')
  const end = text.toLowerCase().indexOf('door ons bestelde')
  if (start < 0) return ''
  const segment = end > start ? text.slice(start, end) : text.slice(start)
  return segment
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.toLowerCase().startsWith('adresinformatie'))
    .join(', ')
}

export function parseGazelleDescription(html: string): GazelleParsed {
  const text = stripHtml(html)
  return {
    besteldatum: extractField(text, 'Besteldatum') || null,
    bestelnummer: extractField(text, 'Bestelnummer') || null,
    naam: extractField(text, 'Naam') || null,
    bedrijfsnaam: extractField(text, 'Bedrijfsnaam') || null,
    emailadres: extractField(text, 'E-mailadres') || null,
    referentie: extractField(text, 'Referentie') || null,
    opmerkingen: extractField(text, 'Opmerkingen') || null,
    adres: parseAdres(text) || null,
    producten: parseProducten(text),
  }
}
