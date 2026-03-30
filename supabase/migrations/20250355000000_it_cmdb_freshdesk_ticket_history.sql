-- Geschiedenis van Freshdesk-tickets per CMDB-apparaat (alle aangemaakte tickets)

create table if not exists public.it_cmdb_hardware_freshdesk_ticket (
  id uuid primary key default gen_random_uuid(),
  hardware_id uuid not null references public.it_cmdb_hardware (id) on delete cascade,
  freshdesk_ticket_id bigint not null,
  created_at timestamptz not null default now(),
  constraint it_cmdb_hw_fd_ticket_unique unique (hardware_id, freshdesk_ticket_id)
);

create index if not exists it_cmdb_hw_fd_ticket_hardware_idx
  on public.it_cmdb_hardware_freshdesk_ticket (hardware_id, created_at desc);

comment on table public.it_cmdb_hardware_freshdesk_ticket is
  'Alle Freshdesk-ticket-ids die via de CMDB voor dit apparaat zijn aangemaakt (geschiedenis).';

alter table public.it_cmdb_hardware_freshdesk_ticket enable row level security;

create policy it_cmdb_hw_fd_ticket_select on public.it_cmdb_hardware_freshdesk_ticket
  for select to authenticated
  using (
    exists (
      select 1 from public.it_cmdb_hardware h
      where h.id = hardware_id
      and public.can_access_it_cmdb(auth.uid())
    )
  );

create policy it_cmdb_hw_fd_ticket_insert on public.it_cmdb_hardware_freshdesk_ticket
  for insert to authenticated
  with check (
    public.can_access_it_cmdb(auth.uid())
    and exists (
      select 1 from public.it_cmdb_hardware h
      where h.id = hardware_id
    )
  );

-- Bestaande koppelingen als eerste historieregel
insert into public.it_cmdb_hardware_freshdesk_ticket (hardware_id, freshdesk_ticket_id)
select id, freshdesk_ticket_id
from public.it_cmdb_hardware
where freshdesk_ticket_id is not null
on conflict (hardware_id, freshdesk_ticket_id) do nothing;
