-- Publieke afbeeldingen: instelbare afbeeldingen bereikbaar via een openbare URL
-- Elke afbeelding heeft een unieke slug die de publieke URL bepaalt:
-- /api/public/afbeelding/[slug]

create table publieke_afbeeldingen (
  id          uuid primary key default gen_random_uuid(),
  naam        text not null,
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  storage_path text not null,
  mime_type   text not null default 'image/jpeg',
  breedte     int,
  hoogte      int,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table publieke_afbeeldingen enable row level security;

-- Alleen admins mogen schrijven
create policy "Admins mogen publieke afbeeldingen beheren"
  on publieke_afbeeldingen for all
  to authenticated
  using (exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin'))
  with check (exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin'));

-- Iedereen mag lezen (voor de publieke API route)
create policy "Iedereen mag publieke afbeeldingen lezen"
  on publieke_afbeeldingen for select
  using (true);

-- Storage bucket voor publieke afbeeldingen (publiek toegankelijk)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'publieke-afbeeldingen',
  'publieke-afbeeldingen',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Storage RLS: admins mogen uploaden/verwijderen
create policy "Admins mogen afbeeldingen uploaden"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'publieke-afbeeldingen' and
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

create policy "Admins mogen afbeeldingen verwijderen"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'publieke-afbeeldingen' and
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

create policy "Iedereen mag publieke afbeeldingen downloaden"
  on storage.objects for select
  using (bucket_id = 'publieke-afbeeldingen');
