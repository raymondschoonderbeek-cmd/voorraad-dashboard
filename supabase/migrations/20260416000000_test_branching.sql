-- Test migratie: Supabase GitHub branching verificatie
-- Wordt automatisch verwijderd na de test.
create table if not exists _test_branching (
  id serial primary key,
  aangemaakt_op timestamptz default now(),
  opmerking text default 'Supabase preview branch werkt correct'
);
