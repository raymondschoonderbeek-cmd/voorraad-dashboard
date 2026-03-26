-- Lunch-cron en andere server-side flows gebruiken service role; auth.uid() is dan null,
-- waardoor de oude admin-check altijd faalde en geen e-mails werden teruggegeven.
create or replace function public.get_user_emails(user_ids uuid[])
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((auth.jwt() ->> 'role'), '') is distinct from 'service_role' then
    if not exists (
      select 1 from public.gebruiker_rollen
      where gebruiker_rollen.user_id = auth.uid() and rol = 'admin'
    ) then
      return;
    end if;
  end if;
  return query
  select u.id, coalesce(u.email, '')::text
  from auth.users u
  where u.id = any(user_ids);
end;
$$;

comment on function public.get_user_emails(uuid[]) is 'E-mails uit auth.users; ingelogde admin of service_role (server).';
