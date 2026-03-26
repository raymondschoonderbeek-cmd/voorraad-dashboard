-- Lunch herinneringsmail (beheer): aan/uit, weekdag, tijd (Europe/Amsterdam in app)
alter table lunch_config
  add column if not exists reminder_mail_enabled boolean not null default false,
  add column if not exists reminder_weekday smallint not null default 5
    check (reminder_weekday >= 1 and reminder_weekday <= 7),
  add column if not exists reminder_time_local text not null default '08:00';

comment on column lunch_config.reminder_mail_enabled is 'Herinneringsmail naar lunch-gebruikers (Mailgun + magic link)';
comment on column lunch_config.reminder_weekday is 'ISO weekdag 1=ma … 7=zo; wanneer de mail wordt verstuurd';
comment on column lunch_config.reminder_time_local is 'HH:mm (24u), Europe/Amsterdam';

-- Gebruiker kan zich afmelden voor herinneringsmails (V3)
alter table public.profiles
  add column if not exists lunch_reminder_opt_out boolean not null default false;

comment on column public.profiles.lunch_reminder_opt_out is 'Geen lunch herinneringsmail ontvangen';

create table if not exists public.lunch_reminder_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, reminder_date)
);

comment on table public.lunch_reminder_sent is 'Voorkomt dubbele herinneringsmails per gebruiker per besteldag';

alter table public.lunch_reminder_sent enable row level security;

-- Alleen service role / backend schrijft hier; geen policy voor anon (backend gebruikt service role)
