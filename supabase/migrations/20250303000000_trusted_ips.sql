-- Vertrouwde IP-adressen voor MFA (geen MFA nodig vanaf deze IP's)
-- Alleen admins kunnen deze beheren via Beheer > Vertrouwde IP's

create table if not exists trusted_ips (
  id bigint generated always as identity primary key,
  ip_or_cidr text not null unique,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);

-- RLS: alle ingelogde gebruikers mogen lezen (voor MFA-check), alleen admins mogen schrijven
alter table trusted_ips enable row level security;

create policy "Ingelogde gebruikers mogen trusted_ips lezen"
  on trusted_ips for select
  to authenticated
  using (true);

create policy "Alleen admins mogen trusted_ips toevoegen"
  on trusted_ips for insert
  to authenticated
  with check (
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );

create policy "Alleen admins mogen trusted_ips verwijderen"
  on trusted_ips for delete
  to authenticated
  using (
    exists (select 1 from gebruiker_rollen where user_id = auth.uid() and rol = 'admin')
  );
