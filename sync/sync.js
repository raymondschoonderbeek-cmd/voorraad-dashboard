'use strict';

require('dotenv').config();
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── Configuratie ──────────────────────────────────────────────────────────────

const EXCEL_PATH = process.env.EXCEL_PATH;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

const LOG_PATH = path.join(__dirname, 'sync.log');
const MAX_LOG_BYTES = 100 * 1024 * 1024; // 100 MB

// Kolommen die NIET naar Supabase gaan (0-gebaseerde index)
// A=0 (sleutel, apart behandeld), B=1 (Lidnr, uitgesloten), N=13 (Fax), AF=31, AG=32, AH=33, AI=34
const SKIP_COLS = new Set([0, 1, 13, 31, 32, 33, 34]);

// Kolomindex van de sleutel (A = index 0 = Lidnr DRG)
const KEY_COL_INDEX = 0;

// Mapping van Excel-kolomnaam → Supabase-veldnaam
const KOLOM_MAP = {
  'CBnr':                            'cbnr',
  'Geblokkeerd':                     'geblokkeerd',
  'Naam':                            'naam',
  'Straat':                          'straat',
  'Huisnr ':                         'huisnummer',
  'Postcode':                        'postcode',
  'Plaats':                          'stad',
  'Provincie':                       'provincie',
  'Land':                            'land',
  'Contactpersoon':                  'contactpersoon',
  'Telefoon':                        'telefoon',
  'E mail':                          'email',
  'E mailadres administratie':       'email_administratie',
  'WWW':                             'website',
  'IBAN':                            'iban',
  'BTW Nummer':                      'btw_nummer',
  'KVK':                             'kvk',
  'GLN':                             'gln',
  'Regio Manager':                   'regio_manager',
  'Formule':                         'formule',
  'Aangesloten\nsinds':              'aangesloten_sinds',
  'Bike Totaal Nieuw Start':         'bike_totaal_nieuw_start',
  'Bike Totaal Nieuw Eind':          'bike_totaal_nieuw_eind',
  'VVO in m2 ':                      'vvo_m2',
  'Deelname Centraal Betalen':       'deelname_centraal_betalen',
  'CM Fietsen en O&A \nDeelname':    'cm_fietsen_deelname',
  'CM Fietsen en O&A\nInstroom':     'cm_fietsen_instroom',
  'CM Fietsen en O&A\nUitstroom':    'cm_fietsen_uitstroom',
  'Kassasysteem':                    'kassasysteem',
  'Laatste contract':                'laatste_contract',
  'Jaarcijfers':                     'jaarcijfers',
  'Sales Channels\ntbv QV':          'sales_channels_qv',
  'Accountant':                      'accountant',
  'Startdatum Servicepas DRS':       'startdatum_servicepas_drs',
  'Einddatum Servicepas DRS':        'einddatum_servicepas_drs',
  'Webshoporders Naar Kassa':        'webshoporders_naar_kassa',
  'Startdatum Lease-\ncontract':     'startdatum_lease',
  'Einddatum Lease-\ncontract':      'einddatum_lease',
  'Deelname\nServicepas DRS':        'deelname_servicepas_drs',
  'Deelname Lease-contract':         'deelname_lease',
};

// Land-afkorting → volledige naam (zoals Supabase het verwacht)
const LAND_MAP = { NL: 'Netherlands', BE: 'Belgium' };

// ── Logging ───────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'medium' });
}

function trimLog() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const stat = fs.statSync(LOG_PATH);
    if (stat.size <= MAX_LOG_BYTES) return;

    // Bestand te groot: gooi eerste helft weg
    const inhoud = fs.readFileSync(LOG_PATH, 'utf8');
    const helft = Math.floor(inhoud.length / 2);
    const eersteNieuweRegel = inhoud.indexOf('\n', helft);
    const nieuw = '... [oudere logs verwijderd]\n' + inhoud.slice(eersteNieuweRegel + 1);
    fs.writeFileSync(LOG_PATH, nieuw, 'utf8');
  } catch (err) {
    console.error(`Log trimmen mislukt: ${err.message}`);
  }
}

function log(msg) {
  const regel = `[${timestamp()}] ${msg}`;
  console.log(regel);
  try {
    fs.appendFileSync(LOG_PATH, regel + '\n', 'utf8');
  } catch (err) {
    console.error(`Log schrijven mislukt: ${err.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function waardSchoonmaken(waarde) {
  if (waarde === null || waarde === undefined) return null;
  if (typeof waarde === 'number') return String(waarde);
  const s = String(waarde).trim();
  return s === '' ? null : s;
}

// ── Hoofdlogica ───────────────────────────────────────────────────────────────

async function main() {
  trimLog();

  if (!EXCEL_PATH) { console.error('EXCEL_PATH is niet ingesteld in .env'); process.exit(1); }
  if (!SUPABASE_URL) { console.error('SUPABASE_URL is niet ingesteld in .env'); process.exit(1); }
  if (!SUPABASE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY is niet ingesteld in .env'); process.exit(1); }

  log('═'.repeat(50));
  log(`DRG Ledenlijst Sync ${DRY_RUN ? '(DRY-RUN — geen wijzigingen)' : ''}`);
  log(`Bestand: ${EXCEL_PATH}`);

  // Excel inlezen
  let workbook;
  try {
    workbook = XLSX.readFile(EXCEL_PATH, { cellDates: false, raw: false });
  } catch (err) {
    console.error(`Kan Excel-bestand niet openen: ${err.message}`);
    process.exit(1);
  }

  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const alleRijen = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });

  const headerRij = alleRijen[0];
  const dataRijen = alleRijen.slice(1).filter(rij => rij.some(v => v !== null && v !== ''));

  if (!headerRij) {
    console.error('Geen headers gevonden in rij 2 van het Excel-bestand');
    process.exit(1);
  }

  log(`Headers gevonden: ${headerRij.length} kolommen`);
  log(`Data: ${dataRijen.length} rijen`);

  // Kolom-index → Supabase-veldnaam opbouwen
  const kolomMapping = [];
  for (let i = 0; i < headerRij.length; i++) {
    if (SKIP_COLS.has(i)) continue;
    const header = headerRij[i];
    if (!header) continue;
    const veld = KOLOM_MAP[header];
    if (!veld) {
      log(`⚠️  Onbekende kolom "${header}" (index ${i}) — wordt overgeslagen`);
      continue;
    }
    kolomMapping.push({ index: i, veld });
  }

  // Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // Alle lidnummers uit Excel verzamelen
  const excelLidnummers = new Set();
  let overgeslagen = 0;

  for (const rij of dataRijen) {
    const lidnummer = waardSchoonmaken(rij[KEY_COL_INDEX]);
    if (!lidnummer) { overgeslagen++; continue; }
    excelLidnummers.add(lidnummer);
  }

  // Bij dry-run: bestaande lidnummers ophalen uit Supabase
  if (DRY_RUN) {
    log(`Bestaande lidnummers ophalen uit Supabase...`);
    let bestaandeSet = new Set();
    let bestaandeNamen = {};
    let page = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('winkels')
        .select('lidnummer, naam')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) {
        console.error(`Fout bij ophalen bestaande records: ${error.message}`);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      data.forEach(r => {
        bestaandeSet.add(r.lidnummer);
        bestaandeNamen[r.lidnummer] = r.naam;
      });
      if (data.length < PAGE_SIZE) break;
      page++;
    }
    log(`${bestaandeSet.size} bestaande records gevonden in Supabase`);

    const nieuw = [...excelLidnummers].filter(l => !bestaandeSet.has(l));
    const bijwerken = [...excelLidnummers].filter(l => bestaandeSet.has(l));
    const ontbrekenInExcel = [...bestaandeSet].filter(l => l && !excelLidnummers.has(l));

    log('─'.repeat(50));
    log(`DRY-RUN resultaat:`);
    log(`  ✅ ${bijwerken.length} records worden bijgewerkt`);
    log(`  🆕 ${nieuw.length} records worden nieuw aangemaakt`);
    log(`  ⏭️  ${overgeslagen} overgeslagen (geen lidnummer)`);

    if (nieuw.length > 0) {
      log(`Nieuwe lidnummers: ${nieuw.slice(0, 10).join(', ')}${nieuw.length > 10 ? ` ... en ${nieuw.length - 10} meer` : ''}`);
    }

    if (ontbrekenInExcel.length > 0) {
      log('─'.repeat(50));
      log(`⚠️  ${ontbrekenInExcel.length} records staan WEL in Supabase maar NIET in Excel:`);
      ontbrekenInExcel.forEach(l => {
        log(`  → lidnummer=${l} naam=${bestaandeNamen[l] ?? 'onbekend'}`);
      });
    } else {
      log(`  ✔️  Geen records in Supabase die ontbreken in Excel`);
    }

    return;
  }

  // ── Echte sync ────────────────────────────────────────────────────────────

  let bijgewerkt = 0;
  let fouten = 0;
  const BATCH = 50;

  for (let start = 0; start < dataRijen.length; start += BATCH) {
    const batch = dataRijen.slice(start, start + BATCH);
    const records = [];

    for (const rij of batch) {
      const lidnummer = waardSchoonmaken(rij[KEY_COL_INDEX]);
      if (!lidnummer) continue;

      const record = { lidnummer };
      for (const { index, veld } of kolomMapping) {
        let waarde = waardSchoonmaken(rij[index]);
        if (veld === 'land' && waarde) {
          waarde = LAND_MAP[waarde] ?? waarde;
        }
        record[veld] = waarde;
      }
      records.push(record);
    }

    if (records.length === 0) continue;

    const { data, error } = await supabase
      .from('winkels')
      .upsert(records, { onConflict: 'lidnummer', ignoreDuplicates: false })
      .select('id');

    if (error) {
      console.error(`Fout bij batch ${start + 1}–${start + records.length}: ${error.message}`);
      log(`❌ Fout bij batch ${start + 1}–${start + records.length}: ${error.message}`);
      fouten += records.length;
    } else {
      bijgewerkt += data?.length ?? records.length;
      log(`Batch ${start + 1}–${Math.min(start + BATCH, dataRijen.length)}: ✓ ${data?.length ?? records.length} upserted`);
    }
  }

  log('─'.repeat(50));
  log(`Sync klaar — ${bijgewerkt} bijgewerkt/aangemaakt, ${overgeslagen} overgeslagen, ${fouten} fouten`);
}

main().catch(err => {
  console.error('Onverwachte fout:', err);
  log(`❌ Onverwachte fout: ${err.message}`);
  process.exit(1);
});
