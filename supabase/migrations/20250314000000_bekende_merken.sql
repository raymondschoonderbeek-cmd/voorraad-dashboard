-- Bekende merken voor Vendit merk-extractie uit productomschrijving
-- Beheerd via Beheer > Merken

create table if not exists bekende_merken (
  id bigint generated always as identity primary key,
  label text not null unique,
  created_at timestamptz default now()
);

alter table bekende_merken enable row level security;

create policy "Ingelogde gebruikers mogen bekende_merken lezen"
  on bekende_merken for select
  to authenticated
  using (true);

create policy "Alleen admins mogen bekende_merken toevoegen"
  on bekende_merken for insert
  to authenticated
  with check (
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

create policy "Alleen admins mogen bekende_merken verwijderen"
  on bekende_merken for delete
  to authenticated
  using (
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

-- Seed met standaard merken
insert into bekende_merken (label) values
  ('Dutch ID'), ('Van Raam'), ('Sparta'), ('Batavus'), ('Gazelle'), ('Trek'), ('Specialized'), ('Cannondale'),
  ('Giant'), ('Cube'), ('Kalkhoff'), ('Riese & Müller'), ('Stromer'), ('Koga'), ('Cortina'), ('Papa'),
  ('Bergamont'), ('Victoria'), ('Diamant'), ('Hercules'), ('Kettler'), ('Mongoose'), ('Scott')
on conflict (label) do nothing;
