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

  const headerStart = lines.findIndex(l => l.toLowerCase().includes('lev.nr'))
  if (headerStart < 0) return []

  // Sla alle headerregels én tussenliggende lege regels over.
  // Lege regels mogen NIET de loop breken: de HTML-broncode heeft een newline
  // na elke </th>, waardoor er blanco regels tussen kolomnamen staan.
  const HEADER_TERMS = ['lev.nr', 'omschrijving', 'gewenste leverweek', 'aantal', 'totaal stuks']
  let i = headerStart
  while (i < lines.length) {
    const lower = lines[i].toLowerCase()
    if (!lower) { i++; continue }                              // lege regel overslaan
    if (lower === 've' || HEADER_TERMS.some(h => lower.includes(h))) {
      i++
    } else {
      break                                                    // echte data gevonden
    }
  }

  // Verzamel alle niet-lege regels tot de footer (sla lege regels over).
  // Lege regels BINNEN een productrij (door newline na elke </td> in bronHTML)
  // worden zo meegenomen zonder de groepering te breken.
  const contentLines: string[] = []
  while (i < lines.length) {
    const line = lines[i]
    if (line && (
      line.toLowerCase().includes('vriendelijke groet') ||
      line.toLowerCase().includes('klik hier') ||
      line.toLowerCase().includes('afmelden')
    )) break
    if (line) contentLines.push(line)
    i++
  }

  // Groepeer per 6 regels = één productrij (6 kolommen).
  // Na elke 6-regelgroep kan een colspan-notitieregel staan (bijv. "geen") —
  // dat is een <td colspan="6"> in de bronHTML die na stripping één losse
  // regel oplevert. Sla die over zodat de volgende productrij correct begint.
  const producten: GazelleProduct[] = []
  let j = 0
  while (j < contentLines.length) {
    const b = contentLines.slice(j, j + 6)
    if (b.length < 2) break  // minder dan 2 velden → geen geldig product
    producten.push({
      lev_nr: b[0] ?? '',
      omschrijving: b[1] ?? '',
      gewenste_leverweek: b[2] ?? '',
      aantal: b[3] ?? '',
      ve: b[4] ?? '',
      totaal_stuks: b[5] ?? '',
    })
    j += 6
    // Sla colspan-notitiegel over: één losse waarde die geen lev_nr is
    // (bijv. "geen", een opmerking). Lev_nrs beginnen met "Pakket" of zijn numeriek.
    if (j < contentLines.length) {
      const volgende = contentLines[j]
      const isLevNr = /^pakket\s/i.test(volgende) || /^\d/.test(volgende)
      if (!isLevNr) j++
    }
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
