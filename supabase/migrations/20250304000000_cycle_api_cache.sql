-- Cache voor CycleSoftware API-toegang per winkel
-- Voorkomt herhaaldelijke API-calls bij 100+ winkels

alter table winkels
  add column if not exists cycle_api_authorized boolean,
  add column if not exists cycle_api_checked_at timestamptz;

comment on column winkels.cycle_api_authorized is 'CycleSoftware API heeft toestemming (gecached)';
comment on column winkels.cycle_api_checked_at is 'Laatste keer dat API-status gecontroleerd is';
