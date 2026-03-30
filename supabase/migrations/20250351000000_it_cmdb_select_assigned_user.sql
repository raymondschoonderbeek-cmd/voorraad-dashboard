-- Gebruiker mag eigen toegewezen CMDB-regels lezen (voor Mijn instellingen)

create policy it_cmdb_hardware_select_assigned on public.it_cmdb_hardware
  for select to authenticated
  using (
    assigned_user_id is not null
    and assigned_user_id = auth.uid()
  );

comment on policy it_cmdb_hardware_select_assigned on public.it_cmdb_hardware is
  'Toegewezen gebruiker ziet eigen hardware in portal (naast it-cmdb-modulebeleid).';
