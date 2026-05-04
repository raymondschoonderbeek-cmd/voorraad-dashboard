-- Voeg lidnummer toe aan winkels tabel
alter table winkels add column if not exists lidnummer text;
