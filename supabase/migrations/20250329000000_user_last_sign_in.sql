-- Functie om laatste inlogdatum op te halen uit auth.users (alleen voor admins)
create or replace function public.get_user_last_sign_ins(user_ids uuid[])
returns table(user_id uuid, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.gebruiker_rollen
    where gebruiker_rollen.user_id = auth.uid() and rol = 'admin'
  ) then
    return;
  end if;
  return query
  select u.id, u.last_sign_in_at
  from auth.users u
  where u.id = any(user_ids);
end;
$$;

comment on function public.get_user_last_sign_ins(uuid[]) is 'Haalt laatste inlogdatum op uit auth.users. Alleen admins.';

grant execute on function public.get_user_last_sign_ins(uuid[]) to authenticated;
grant execute on function public.get_user_last_sign_ins(uuid[]) to service_role;
