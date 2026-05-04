create table if not exists winkel_activiteit (
  id          bigserial primary key,
  winkel_id   integer not null references winkels(id) on delete cascade,
  kind        text not null default 'notitie', -- 'notitie' | 'taak' | 'belverslag'
  body        text not null,
  meta        jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);
alter table winkel_activiteit enable row level security;
create policy "Authenticated users can read winkel_activiteit"
  on winkel_activiteit for select to authenticated using (true);
create policy "Authenticated users can insert winkel_activiteit"
  on winkel_activiteit for insert to authenticated with check (auth.uid() = created_by);
create index if not exists winkel_activiteit_winkel_id_idx on winkel_activiteit(winkel_id);
create index if not exists winkel_activiteit_created_at_idx on winkel_activiteit(created_at desc);
