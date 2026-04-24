-- Google Sheet koppeling verwijderd, kolom niet meer nodig
alter table gazelle_observer_instellingen
  drop column if exists google_sheet_url;
