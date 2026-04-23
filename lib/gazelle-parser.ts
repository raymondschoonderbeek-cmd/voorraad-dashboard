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
  // De HTML-broncode heeft een newline na elke </td>, waardoor tabs als
  // scheidingsteken verdwijnen door [ \t]+\n cleanup. Oplossing: </td> → \n
  // zodat label en waarde elk op een eigen regel staan (die we apart parsen).
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/th>/gi, '\n')
    .replace(/<\/td>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripGazelleHtml(html: string): string {
  return stripHtml(html)
}

// Pakt waarde die op dezelfde regel staat als het label ("Label: waarde")
// of op de volgende niet-lege regel ("Label:\n\nwaarde").
function extractField(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lines = text.split('\n').map(l => l.trim())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Formaat: "Label: waarde" op dezelfde regel
    const sameLineMatch = line.match(new RegExp(`^${escaped}\\s*:\\s*(.+)$`, 'i'))
    if (sameLineMatch?.[1]) return sameLineMatch[1].trim()

    // Formaat: "Label:" alleen op de regel, waarde op volgende niet-lege regel
    if (new RegExp(`^${escaped}\\s*:?\\s*$`, 'i').test(line)) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]
        if (!next) continue
        // Volgende niet-lege regel is ook een label → waarde is leeg
        if (/^[^:]+:\s*$/.test(next)) return ''
        return next
      }
      return ''
    }
  }
  return ''
}

function parseProducten(text: string): GazelleProduct[] {
  const lines = text.split('\n').map(l => l.trim())

  // Zoek startpositie van de kolomheaders
  const headerStart = lines.findIndex(l => l.toLowerCase().includes('lev.nr'))
  if (headerStart < 0) return []

  // Sla alle headerregels over
  const HEADER_TERMS = ['lev.nr', 'omschrijving', 'gewenste leverweek', 'aantal', 'totaal stuks']
  let i = headerStart
  while (i < lines.length) {
    const lower = lines[i].toLowerCase()
    if (lower === 've' || HEADER_TERMS.some(h => lower.includes(h))) {
      i++
    } else {
      break
    }
  }

  // Sla lege regels na de headers over
  while (i < lines.length && !lines[i]) i++

  const producten: GazelleProduct[] = []

  while (i < lines.length) {
    if (!lines[i]) { i++; continue }
    if (
      lines[i].toLowerCase().includes('vriendelijke groet') ||
      lines[i].toLowerCase().includes('klik hier') ||
      lines[i].toLowerCase().includes('afmelden')
    ) break

    // Verzamel opeenvolgende niet-lege regels als één productrij (max 6 kolommen)
    const values: string[] = []
    while (i < lines.length && values.length < 6) {
      const line = lines[i]
      if (!line) break
      if (
        line.toLowerCase().includes('vriendelijke groet') ||
        line.toLowerCase().includes('klik hier') ||
        line.toLowerCase().includes('afmelden')
      ) break
      values.push(line)
      i++
    }

    // Minimaal lev.nr + omschrijving om als product te tellen
    if (values.length >= 2 && values[0]) {
      producten.push({
        lev_nr: values[0],
        omschrijving: values[1] ?? '',
        gewenste_leverweek: values[2] ?? '',
        aantal: values[3] ?? '',
        ve: values[4] ?? '',
        totaal_stuks: values[5] ?? '',
      })
    }

    // Sla lege regels tussen producten over
    while (i < lines.length && !lines[i]) i++
  }

  return producten
}

function parseAdres(text: string): string {
  const lower = text.toLowerCase()
  const start = lower.indexOf('adresinformatie')
  const end = lower.indexOf('door ons bestelde')
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
