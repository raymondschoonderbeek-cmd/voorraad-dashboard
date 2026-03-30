-- IT-hardware CMDB (intern): laptops, serienummers, Intune, locatie

create or replace function public.can_access_it_cmdb(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_drg_admin(uid)
  or exists (
    select 1 from public.profiles p
    where p.user_id = uid
    and p.modules_toegang is not null
    and jsonb_typeof(p.modules_toegang) = 'array'
    and p.modules_toegang @> '["it-cmdb"]'::jsonb
  );
$$;

comment on function public.can_access_it_cmdb(uuid) is 'Admin of profiles.modules_toegang bevat it-cmdb.';

grant execute on function public.can_access_it_cmdb(uuid) to authenticated;
grant execute on function public.can_access_it_cmdb(uuid) to service_role;

create table if not exists public.it_cmdb_hardware (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null,
  hostname text not null default '',
  intune text,
  user_name text,
  device_type text,
  notes text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint it_cmdb_serial_unique unique (serial_number)
);

create index if not exists it_cmdb_hardware_serial_idx on public.it_cmdb_hardware (serial_number);
create index if not exists it_cmdb_hardware_location_idx on public.it_cmdb_hardware (location);
create index if not exists it_cmdb_hardware_hostname_idx on public.it_cmdb_hardware (hostname);

comment on table public.it_cmdb_hardware is 'Intern IT-hardware overzicht (CMDB); module it-cmdb.';
comment on column public.it_cmdb_hardware.serial_number is 'Service tag / serienummer';
comment on column public.it_cmdb_hardware.intune is 'Bijv. Intune, Ja, Nee';

alter table public.it_cmdb_hardware enable row level security;

create policy it_cmdb_hardware_select on public.it_cmdb_hardware
  for select to authenticated
  using (public.can_access_it_cmdb(auth.uid()));

create policy it_cmdb_hardware_insert on public.it_cmdb_hardware
  for insert to authenticated
  with check (public.can_access_it_cmdb(auth.uid()));

create policy it_cmdb_hardware_update on public.it_cmdb_hardware
  for update to authenticated
  using (public.can_access_it_cmdb(auth.uid()))
  with check (public.can_access_it_cmdb(auth.uid()));

create policy it_cmdb_hardware_delete on public.it_cmdb_hardware
  for delete to authenticated
  using (public.can_access_it_cmdb(auth.uid()));
