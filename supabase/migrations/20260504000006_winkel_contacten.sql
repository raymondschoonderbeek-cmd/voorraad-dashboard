create table if not exists winkel_contacten (
  id          bigserial primary key,
  winkel_id   integer not null references winkels(id) on delete cascade,
  naam        text not null,
  telefoon    text,
  email       text,
  opmerking   text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);

alter table winkel_contacten enable row level security;

create policy "Authenticated users kunnen winkel_contacten lezen"
  on winkel_contacten for select to authenticated using (true);

create policy "Authenticated users kunnen winkel_contacten toevoegen"
  on winkel_contacten for insert to authenticated with check (auth.uid() = created_by);

create policy "Aanmaker kan eigen winkel_contacten verwijderen"
  on winkel_contacten for delete to authenticated using (auth.uid() = created_by);

create index if not exists winkel_contacten_winkel_id_idx on winkel_contacten(winkel_id);
