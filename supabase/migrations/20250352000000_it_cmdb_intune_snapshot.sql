-- Gestructureerde Intune/Graph-velden na sync (JSON)

alter table public.it_cmdb_hardware
  add column if not exists intune_snapshot jsonb;

comment on column public.it_cmdb_hardware.intune_snapshot is
  'Snapshot van Graph managedDevice: complianceState, managementState, lastSyncDateTime, graphDeviceId, model, …';
