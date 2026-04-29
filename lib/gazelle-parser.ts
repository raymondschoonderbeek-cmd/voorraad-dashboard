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

// Strip HTML binnen één tabelcel — <br> wordt spatie zodat omschrijving
// die over meerdere regels staat toch als één string uitkomt.
function stripCelHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function extractField(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lines = text.split('\n').map(l => l.trim())

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const sameLineMatch = line.match(new RegExp(`^${escaped}\\s*:\\s*(.+)$`, 'i'))
    if (sameLineMatch?.[1]) return sameLineMatch[1].trim()

    if (new RegExp(`^${escaped}\\s*:?\\s*$`, 'i').test(line)) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]
        if (!next) continue
        if (/^[^:]+:\s*$/.test(next)) return ''
        return next
      }
      return ''
    }
  }
  return ''
}

// Parseer producten direct uit de HTML-tabelstructuur.
// Voordelen t.o.v. tekst-gebaseerde aanpak:
//  - colspan-rijen (bijv. "geen") worden herkend en overgeslagen via het colspan-attribuut
//  - <br> binnen een <td> wordt spatie → omschrijving blijft één veld
function parseProductenUitHTML(html: string): GazelleProduct[] {
  // Vind de sectie vanaf de productkoptekst
  const lowerHtml = html.toLowerCase()
  const sectionStart = lowerHtml.indexOf('lev.nr')
  if (sectionStart < 0) return []
  const htmlSection = html.slice(sectionStart)

  const producten: GazelleProduct[] = []
  const footerTermen = ['vriendelijke groet', 'klik hier', 'afmelden']

  // Loop over elke <tr>
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null

  while ((trMatch = trRegex.exec(htmlSection)) !== null) {
    const rijHtml = trMatch[1]

    // Sla <tr> over die header-elementen (<th>) bevatten
    if (/<th[\s>]/i.test(rijHtml)) continue

    // Sla colspan-rijen over (bijv. <td colspan="6">geen</td>)
    if (/colspan\s*=\s*["']?\d+["']?/i.test(rijHtml)) continue

    // Extraheer alle <td>-cellen
    const cellen: string[] = []
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let tdMatch: RegExpExecArray | null
    while ((tdMatch = tdRegex.exec(rijHtml)) !== null) {
      cellen.push(stripCelHtml(tdMatch[1]))
    }

    if (cellen.length < 2) continue

    // Stop bij footer-inhoud
    const celTekst = cellen.join(' ').toLowerCase()
    if (footerTermen.some(t => celTekst.includes(t))) break

    producten.push({
      lev_nr: cellen[0] ?? '',
      omschrijving: cellen[1] ?? '',
      gewenste_leverweek: cellen[2] ?? '',
      aantal: cellen[3] ?? '',
      ve: cellen[4] ?? '',
      totaal_stuks: cellen[5] ?? '',
    })
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
    producten: parseProductenUitHTML(html),
  }
}
