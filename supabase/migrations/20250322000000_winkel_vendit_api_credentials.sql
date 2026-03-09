-- Vendit API credentials per winkel (optioneel, voor api_type = 'vendit')
-- Gebruikt in module Vendit API Tester

alter table winkels add column if not exists vendit_api_key text;
alter table winkels add column if not exists vendit_api_username text;
alter table winkels add column if not exists vendit_api_password text;

comment on column winkels.vendit_api_key is 'Vendit Public API key (per winkel)';
comment on column winkels.vendit_api_username is 'Vendit API username';
comment on column winkels.vendit_api_password is 'Vendit API wachtwoord';
