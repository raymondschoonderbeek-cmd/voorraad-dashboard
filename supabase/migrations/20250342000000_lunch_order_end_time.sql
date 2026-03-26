-- Uiterste besteltijd (Europe/Amsterdam, HH:mm); na deze tijd geen bestelling meer voor die kalenderdag
alter table lunch_config
  add column if not exists order_end_time_local text not null default '10:30';

comment on column lunch_config.order_end_time_local is 'HH:mm (24u), Amsterdam; bestellen voor vandaag tot dit tijdstip';
