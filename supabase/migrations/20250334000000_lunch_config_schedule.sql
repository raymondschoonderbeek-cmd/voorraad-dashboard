-- Besteldagen (ISO: 1=maandag .. 7=zondag) en gesloten kalenderdagen
alter table lunch_config
  add column if not exists order_weekdays smallint[] not null default '{1,2,3,4,5}',
  add column if not exists closed_dates date[] not null default '{}';

comment on column lunch_config.order_weekdays is 'ISO weekdag 1–7; dagen waarop bestellen mag';
comment on column lunch_config.closed_dates is 'Extra gesloten dagen (feestdagen, enz.)';
