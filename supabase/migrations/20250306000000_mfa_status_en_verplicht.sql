-- MFA-status en mfa_verplicht per gebruiker
-- Voer uit in Supabase SQL Editor of via: supabase db push

-- Functie om MFA-status op te halen uit auth.mfa_factors (alleen voor admins)
create or replace function public.get_user_mfa_status(user_ids uuid[])
returns table(user_id uuid, has_mfa boolean)
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
  select m.user_id, true
  from auth.mfa_factors m
  where m.user_id = any(user_ids)
    and m.factor_type = 'totp'
  group by m.user_id;
end;
$$;

comment on function public.get_user_mfa_status(uuid[]) is 'Haalt MFA-status op uit auth.mfa_factors. Alleen admins.';

grant execute on function public.get_user_mfa_status(uuid[]) to authenticated;
grant execute on function public.get_user_mfa_status(uuid[]) to service_role;

-- mfa_verplicht per gebruiker (admin kan MFA verplichten)
alter table public.gebruiker_rollen
  add column if not exists mfa_verplicht boolean default false;

comment on column public.gebruiker_rollen.mfa_verplicht is 'Admin kan MFA verplichten voor deze gebruiker';
