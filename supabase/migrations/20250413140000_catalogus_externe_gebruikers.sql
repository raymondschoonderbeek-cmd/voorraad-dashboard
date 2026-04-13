-- user_id nullable maken voor externe (niet-portal) gebruikers
alter table it_catalogus_gebruikers
  alter column user_id drop not null;

-- E-mailadres en naam van externe Microsoft gebruikers opslaan
alter table it_catalogus_gebruikers
  add column if not exists microsoft_email text,
  add column if not exists microsoft_naam text;

-- Unieke constraint op (catalogus_id, microsoft_email) voor externe gebruikers
create unique index if not exists it_catalogus_gebruikers_ext_email_idx
  on it_catalogus_gebruikers (catalogus_id, microsoft_email)
  where user_id is null and microsoft_email is not null;
