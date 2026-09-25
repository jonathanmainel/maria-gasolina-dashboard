create index dashboard_network_unit_imports_created_by_idx
  on public.dashboard_network_unit_imports (created_by)
  where created_by is not null;
