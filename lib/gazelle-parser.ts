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
  // Geen <td>-br-fix: de outer HTML is ook een geneste tabel waardoor de
  // regex grote chunks HTML opslokt en de productrijen kapot maakt.
  // <br> buiten tabellen (adresblok) → \n; binnen tabel-cellen wordt dit
  // afgevangen in parseProducten door de lookahead op de volgende regel.
  return html
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
  // Gebruik [ \t]* (geen \s*) zodat de regex niet over newlines heen springt.
  // Anders pakt een leeg veld (Bedrijfsnaam:\t\n) de label van de volgende regel.
  const match = text.match(new RegExp(`${escaped}[ \\t]*:?[ \\t]*([^\\n\\t]+)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function parseProducten(text: string): GazelleProduct[] {
  const lines = text.split('\n').map(l => l.trim())

  const headerIdx = lines.findIndex(l =>
    l.toLowerCase().includes('lev.nr') ||
    (l.toLowerCase().includes('omschrijving') && l.toLowerCase().includes('leverweek'))
  )
  if (headerIdx < 0) return []

  const producten: GazelleProduct[] = []
  let i = headerIdx + 1

  while (i < lines.length) {
    const line = lines[i]

    if (!line) { i++; continue }

    if (
      line.toLowerCase().includes('vriendelijke groet') ||
      line.toLowerCase().includes('klik hier') ||
      line.toLowerCase().includes('afmelden')
    ) break

    const cols = line.split('\t').map(c => c.trim())

    if (cols.length >= 2 && cols[0]) {
      // Normale productregel: tabs aanwezig
      producten.push({
        lev_nr: cols[0],
        omschrijving: cols[1] ?? '',
        gewenste_leverweek: cols[2] ?? '',
        aantal: cols[3] ?? '',
        ve: cols[4] ?? '',
        totaal_stuks: cols[5] ?? '',
      })
      i++
    } else if (cols.length === 1 && cols[0]) {
      // Eén kolom: kan een <br>-gesplitste lev.nr zijn (bijv. "Pakket A\ngeen").
      // Kijk of de volgende regel meerdere kolommen heeft → samenvoegen.
      const nextLine = lines[i + 1] ?? ''
      const nextCols = nextLine.split('\t').map(c => c.trim())
      if (nextCols.length >= 2 && nextCols[0]) {
        producten.push({
          lev_nr: `${cols[0]} ${nextCols[0]}`.trim(),
          omschrijving: nextCols[1] ?? '',
          gewenste_leverweek: nextCols[2] ?? '',
          aantal: nextCols[3] ?? '',
          ve: nextCols[4] ?? '',
          totaal_stuks: nextCols[5] ?? '',
        })
        i += 2
      } else {
        // Noot-rij of colspan-rij (bijv. <td colspan="6">test</td>) → overslaan
        i++
      }
    } else {
      i++
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

export function stripGazelleHtml(html: string): string {
  return stripHtml(html)
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
