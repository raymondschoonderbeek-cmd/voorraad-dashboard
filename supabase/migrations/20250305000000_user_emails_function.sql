-- Functie om e-mailadressen op te halen uit auth.users (alleen voor admins)
-- Gebruikt in Beheer > Gebruikers om inlog-e-mail te tonen

create or replace function public.get_user_emails(user_ids uuid[])
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Alleen admins mogen deze functie aanroepen
  if not exists (
    select 1 from public.gebruiker_rollen
    where gebruiker_rollen.user_id = auth.uid() and rol = 'admin'
  ) then
    return;
  end if;
  return query
  select u.id, coalesce(u.email, '')::text
  from auth.users u
  where u.id = any(user_ids);
end;
$$;

comment on function public.get_user_emails(uuid[]) is 'Haalt e-mailadressen op uit auth.users voor opgegeven user_ids. Alleen admins.';

grant execute on function public.get_user_emails(uuid[]) to authenticated;
grant execute on function public.get_user_emails(uuid[]) to service_role;
