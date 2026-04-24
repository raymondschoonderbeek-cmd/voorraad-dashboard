-- Voeg ontbrekende kolommen toe aan bestaande gazelle_observer_instellingen tabel
alter table gazelle_observer_instellingen
  add column if not exists pakket_instellingen jsonb default '{}'::jsonb,
  add column if not exists google_sheet_url text;
