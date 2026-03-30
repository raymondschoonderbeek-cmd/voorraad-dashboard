-- Validatie assigned_user_id bypassed RLS op gebruiker_rollen (anders ziet alleen eigen rij).

create or replace function public.it_cmdb_is_valid_assigned_user (target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_it_cmdb (auth.uid())
  and exists (
    select 1
    from public.gebruiker_rollen gr
    where gr.user_id = target_user_id
  );
$$;

comment on function public.it_cmdb_is_valid_assigned_user (uuid) is
  'True als target in gebruiker_rollen staat en caller it-cmdb mag; omzeilt RLS bij PATCH/POST.';

grant execute on function public.it_cmdb_is_valid_assigned_user (uuid) to authenticated;
grant execute on function public.it_cmdb_is_valid_assigned_user (uuid) to service_role;
