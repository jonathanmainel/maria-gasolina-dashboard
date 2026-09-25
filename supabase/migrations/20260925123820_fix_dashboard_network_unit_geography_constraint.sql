-- CHECK constraints accept NULL results. Require every resolved geography
-- value explicitly so a partial match cannot be presented as resolved.

alter table public.dashboard_network_units
  drop constraint dashboard_network_units_geography_values_check;

alter table public.dashboard_network_units
  add constraint dashboard_network_units_geography_values_check
  check (
    (
      geography_status = 'resolved'
      and municipality_ibge_code is not null
      and municipality_ibge_code > 0
      and municipality_name is not null
      and municipality_name <> ''
      and latitude is not null
      and latitude between -90 and 90
      and longitude is not null
      and longitude between -180 and 180
    )
    or
    (
      geography_status = 'unresolved'
      and municipality_ibge_code is null
      and municipality_name is null
      and latitude is null
      and longitude is null
    )
  );
