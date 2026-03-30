-- Optionele koppeling CMDB-hardware → DRG-portalgebruiker (auth.users via gebruiker_rollen)

alter table public.it_cmdb_hardware
  add column if not exists assigned_user_id uuid references auth.users (id) on delete set null;

create index if not exists it_cmdb_hardware_assigned_user_idx on public.it_cmdb_hardware (assigned_user_id);

comment on column public.it_cmdb_hardware.assigned_user_id is 'Optioneel: gekoppelde portalgebruiker (zie gebruiker_rollen).';

-- Lijst portalgebruikers voor koppel-UI (alleen bij it-cmdb-toegang)
create or replace function public.it_cmdb_list_portal_users()
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_it_cmdb (auth.uid()) then
    return;
  end if;
  return query
  select u.id, coalesce(u.email, '')::text
  from auth.users u
  inner join public.gebruiker_rollen gr on gr.user_id = u.id
  order by lower(coalesce(u.email, '')), u.id;
end;
$$;

comment on function public.it_cmdb_list_portal_users () is 'DRG-portal gebruikers (gebruiker_rollen) met e-mail; alleen voor it-cmdb-module.';

grant execute on function public.it_cmdb_list_portal_users () to authenticated;
grant execute on function public.it_cmdb_list_portal_users () to service_role;

-- E-mails voor getoonde assigned_user_id’s (batch)
create or replace function public.it_cmdb_resolve_user_emails (user_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_it_cmdb (auth.uid()) then
    return;
  end if;
  if user_ids is null or cardinality(user_ids) = 0 then
    return;
  end if;
  return query
  select u.id, coalesce(u.email, '')::text
  from auth.users u
  where u.id = any (user_ids);
end;
$$;

comment on function public.it_cmdb_resolve_user_emails (uuid[]) is 'E-mailadressen voor user_ids; alleen voor it-cmdb-module.';

grant execute on function public.it_cmdb_resolve_user_emails (uuid[]) to authenticated;
grant execute on function public.it_cmdb_resolve_user_emails (uuid[]) to service_role;
