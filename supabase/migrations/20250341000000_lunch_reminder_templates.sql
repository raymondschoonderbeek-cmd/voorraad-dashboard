-- Bewerkbare mailtemplate voor lunch-herinnering (beheer UI)
alter table lunch_config
  add column if not exists reminder_mail_subject text,
  add column if not exists reminder_mail_html text;

comment on column lunch_config.reminder_mail_subject is 'Onderwerp; placeholders {{prettyDate}}, {{orderDateYmd}}; null = standaard';
comment on column lunch_config.reminder_mail_html is 'HTML body; {{prettyDate}}, {{orderDateYmd}}, {{actionLink}}, {{siteUrl}}; null = standaard';
