-- Tabel voor het bijhouden van wanneer een sync-proces voor het laatst is gedraaid.
-- Wordt gevuld door externe scripts (bijv. sync.js) via de service role key.
create table if not exists sync_meta (
  sync_type        text        primary key,
  synced_at        timestamptz not null default now(),
  status           text        not null default 'ok', -- 'ok' | 'fout'
  regels_bijgewerkt int,
  fouten           int
);

-- Admins mogen lezen; schrijven verloopt via service-role (extern script).
alter table sync_meta enable row level security;

create policy "Admins kunnen sync_meta lezen"
  on sync_meta for select
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );
