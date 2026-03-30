-- Freshdesk-ticket gekoppeld aan CMDB-regel (voorkomt dubbele tickets)

alter table public.it_cmdb_hardware
  add column if not exists freshdesk_ticket_id bigint;

comment on column public.it_cmdb_hardware.freshdesk_ticket_id is
  'Freshdesk ticket id (API v2) na “Maak Freshdesk-ticket”; voorkomt dubbele aanmaak.';

create index if not exists it_cmdb_hardware_freshdesk_ticket_id_idx
  on public.it_cmdb_hardware (freshdesk_ticket_id)
  where freshdesk_ticket_id is not null;

-- Zoeken op portal-e-mail in globale CMDB-zoekbalk (q)
create or replace function public.it_cmdb_user_ids_by_email_needle(p_needle text)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  from auth.users u
  inner join public.gebruiker_rollen gr on gr.user_id = u.id
  where public.can_access_it_cmdb(auth.uid())
  and p_needle is not null and length(trim(p_needle)) > 0
  and coalesce(u.email, '') ilike '%' || trim(p_needle) || '%';
$$;

comment on function public.it_cmdb_user_ids_by_email_needle(text) is
  'UUIDs van portalgebruikers waarvan e-mail overeenkomt met needle; voor it-cmdb zoeken op gebruiker.';

grant execute on function public.it_cmdb_user_ids_by_email_needle(text) to authenticated;
grant execute on function public.it_cmdb_user_ids_by_email_needle(text) to service_role;
