-- Lunch configuratie: Tikkie betaallink (beheerder kan aanpassen)
create table lunch_config (
  id int primary key default 1 check (id = 1),
  tikkie_pay_link text default '',
  updated_at timestamptz default now()
);

insert into lunch_config (id, tikkie_pay_link) values (1, 'https://tikkie.me/pay/vik0pk301it50ijl1l67')
on conflict (id) do nothing;

alter table lunch_config enable row level security;

-- Iedereen die lunch kan bestellen mag de link lezen (voor checkout)
create policy "Authenticated users can read lunch config"
  on lunch_config for select
  to authenticated
  using (true);

-- Alleen admin mag wijzigen
create policy "Admin can update lunch config"
  on lunch_config for update
  using (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  )
  with check (
    exists (
      select 1 from gebruiker_rollen
      where user_id = auth.uid() and rol = 'admin'
    )
  );

comment on table lunch_config is 'Lunch-instellingen; tikkie_pay_link = vaste Tikkie betaallink';
