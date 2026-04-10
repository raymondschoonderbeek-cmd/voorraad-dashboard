-- FTP koppeling instellingen
create table if not exists ftp_koppeling_instellingen (
  id          integer primary key default 1,
  ftp_host    text,
  ftp_user    text,
  ftp_password text,
  ftp_port    integer not null default 21,
  ftp_pad     text not null default '/',
  webhook_secret text,
  actief      boolean not null default true,
  updated_at  timestamptz
);

-- Slechts 1 rij toegestaan
alter table ftp_koppeling_instellingen
  add constraint ftp_koppeling_instellingen_singleton check (id = 1);

-- Alleen service role mag lezen/schrijven (admin client gebruikt service role)
alter table ftp_koppeling_instellingen enable row level security;

-- FTP webhook log
create table if not exists ftp_webhook_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  ticket_id   text,
  status      text not null,
  bericht     text not null,
  geupload    text[] not null default '{}',
  fouten      text[] not null default '{}'
);

alter table ftp_webhook_log enable row level security;

-- Index voor sorteren op datum
create index if not exists ftp_webhook_log_created_at_idx
  on ftp_webhook_log (created_at desc);
