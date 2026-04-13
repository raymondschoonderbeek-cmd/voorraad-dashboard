-- Verwijder singleton constraint zodat meerdere taken mogelijk zijn
alter table ftp_koppeling_instellingen
  drop constraint if exists ftp_koppeling_instellingen_singleton;

alter table ftp_koppeling_instellingen
  drop constraint if exists single_row;

-- Voeg naam kolom toe
alter table ftp_koppeling_instellingen
  add column if not exists naam text not null default 'Taak 1';

-- Maak id een echte sequentie voor nieuwe rijen
create sequence if not exists ftp_koppeling_instellingen_id_seq;
select setval('ftp_koppeling_instellingen_id_seq', coalesce((select max(id) from ftp_koppeling_instellingen), 0));
alter table ftp_koppeling_instellingen
  alter column id set default nextval('ftp_koppeling_instellingen_id_seq');

-- Voeg koppeling_id toe aan log
alter table ftp_webhook_log
  add column if not exists koppeling_id integer references ftp_koppeling_instellingen(id) on delete set null;

create index if not exists ftp_webhook_log_koppeling_id_idx
  on ftp_webhook_log (koppeling_id);
