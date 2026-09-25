-- Persistent network-unit snapshots imported from the Settings screen.
-- XLSX parsing stays in the browser. The protected Edge Function receives
-- canonical JSON rows, validates them, and calls the service-role-only replace
-- function below.

create table public.dashboard_network_unit_imports (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  filename text not null,
  status text not null default 'processing',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  invalid_rows integer not null default 0,
  unresolved_cities integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  error_code text,
  error_details jsonb not null default '[]'::jsonb,
  geography_source text not null,
  geography_source_commit text not null,
  geography_source_checksum text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint dashboard_network_unit_imports_filename_check
    check (char_length(filename) between 1 and 255),
  constraint dashboard_network_unit_imports_status_check
    check (status in ('processing', 'success', 'failed')),
  constraint dashboard_network_unit_imports_counts_check
    check (
      total_rows >= 0
      and valid_rows >= 0
      and duplicate_rows >= 0
      and invalid_rows >= 0
      and unresolved_cities >= 0
      and total_rows = valid_rows + duplicate_rows + invalid_rows
      and unresolved_cities <= valid_rows
    ),
  constraint dashboard_network_unit_imports_error_details_check
    check (jsonb_typeof(error_details) = 'array'),
  constraint dashboard_network_unit_imports_commit_check
    check (geography_source_commit ~ '^[0-9a-f]{40}$'),
  constraint dashboard_network_unit_imports_checksum_check
    check (geography_source_checksum ~ '^[A-F0-9]{64}$')
);

create table public.dashboard_network_units (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  import_id bigint not null references public.dashboard_network_unit_imports(id) on delete cascade,
  source_row_number integer not null,
  unit_name text not null,
  neighborhood text not null,
  city text not null,
  state text not null,
  postal_code text not null,
  normalized_unit_name text not null,
  normalized_neighborhood text not null,
  normalized_city text not null,
  normalized_state text not null,
  normalized_postal_code text not null,
  municipality_ibge_code integer,
  municipality_name text,
  latitude double precision,
  longitude double precision,
  geography_status text not null,
  created_at timestamptz not null default now(),
  constraint dashboard_network_units_source_row_check
    check (source_row_number > 0),
  constraint dashboard_network_units_original_lengths_check
    check (
      char_length(unit_name) between 1 and 200
      and char_length(neighborhood) between 1 and 200
      and char_length(city) between 1 and 120
      and char_length(state) between 1 and 20
      and char_length(postal_code) between 1 and 32
    ),
  constraint dashboard_network_units_normalized_values_check
    check (
      normalized_unit_name <> ''
      and normalized_neighborhood <> ''
      and normalized_city <> ''
      and normalized_state ~ '^[A-Z]{2}$'
      and normalized_postal_code ~ '^[0-9]{8}$'
    ),
  constraint dashboard_network_units_geography_status_check
    check (geography_status in ('resolved', 'unresolved')),
  constraint dashboard_network_units_geography_values_check
    check (
      (
        geography_status = 'resolved'
        and municipality_ibge_code is not null
        and municipality_name is not null
        and latitude between -90 and 90
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
    ),
  unique (
    client_id,
    normalized_unit_name,
    normalized_neighborhood,
    normalized_city,
    normalized_state,
    normalized_postal_code
  )
);

create index dashboard_network_unit_imports_client_created_idx
  on public.dashboard_network_unit_imports (client_id, created_at desc);

create index dashboard_network_units_client_city_idx
  on public.dashboard_network_units (client_id, normalized_state, normalized_city);

create index dashboard_network_units_import_idx
  on public.dashboard_network_units (import_id);

alter table public.dashboard_network_unit_imports enable row level security;
alter table public.dashboard_network_units enable row level security;

create policy dashboard_network_unit_imports_member_select
on public.dashboard_network_unit_imports
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

create policy dashboard_network_units_member_select
on public.dashboard_network_units
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

revoke all on table public.dashboard_network_unit_imports
  from public, anon, authenticated;
revoke all on table public.dashboard_network_units
  from public, anon, authenticated;
revoke all on sequence public.dashboard_network_unit_imports_id_seq
  from public, anon, authenticated;
revoke all on sequence public.dashboard_network_units_id_seq
  from public, anon, authenticated;

grant select on table public.dashboard_network_unit_imports to authenticated;
grant select on table public.dashboard_network_units to authenticated;

grant select, insert, update, delete
on table public.dashboard_network_unit_imports
to service_role;

grant select, insert, update, delete
on table public.dashboard_network_units
to service_role;

grant usage, select
on sequence public.dashboard_network_unit_imports_id_seq
to service_role;

grant usage, select
on sequence public.dashboard_network_units_id_seq
to service_role;

create or replace function public.replace_dashboard_network_units(
  p_import_id bigint,
  p_units jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import public.dashboard_network_unit_imports%rowtype;
  v_units jsonb := coalesce(p_units, '[]'::jsonb);
  v_inserted integer := 0;
begin
  if jsonb_typeof(v_units) <> 'array' then
    raise exception 'INVALID_PAYLOAD: units must be a JSON array'
      using errcode = '22023';
  end if;

  select i.*
  into v_import
  from public.dashboard_network_unit_imports i
  where i.id = p_import_id
    and i.status = 'processing'
  for update;

  if not found then
    raise exception 'IMPORT_NOT_PROCESSING'
      using errcode = '22023';
  end if;

  if jsonb_array_length(v_units) = 0
     or jsonb_array_length(v_units) <> v_import.valid_rows then
    raise exception 'IMPORT_ROW_COUNT_MISMATCH'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dashboard_network_units|' || v_import.client_id::text,
      0
    )
  );

  if exists (
    select 1
    from jsonb_to_recordset(v_units) as r(
      source_row_number integer,
      unit_name text,
      neighborhood text,
      city text,
      state text,
      postal_code text,
      normalized_unit_name text,
      normalized_neighborhood text,
      normalized_city text,
      normalized_state text,
      normalized_postal_code text,
      municipality_ibge_code integer,
      municipality_name text,
      latitude double precision,
      longitude double precision,
      geography_status text
    )
    where r.source_row_number is null
       or r.unit_name is null
       or r.neighborhood is null
       or r.city is null
       or r.state is null
       or r.postal_code is null
       or r.normalized_unit_name is null
       or r.normalized_neighborhood is null
       or r.normalized_city is null
       or r.normalized_state is null
       or r.normalized_postal_code is null
       or r.geography_status is null
  ) then
    raise exception 'INVALID_UNIT_ROW'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_units) as r(
      normalized_unit_name text,
      normalized_neighborhood text,
      normalized_city text,
      normalized_state text,
      normalized_postal_code text
    )
    group by
      r.normalized_unit_name,
      r.normalized_neighborhood,
      r.normalized_city,
      r.normalized_state,
      r.normalized_postal_code
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_UNIT_ROWS'
      using errcode = '22023';
  end if;

  delete from public.dashboard_network_units u
  where u.client_id = v_import.client_id;

  insert into public.dashboard_network_units (
    client_id,
    import_id,
    source_row_number,
    unit_name,
    neighborhood,
    city,
    state,
    postal_code,
    normalized_unit_name,
    normalized_neighborhood,
    normalized_city,
    normalized_state,
    normalized_postal_code,
    municipality_ibge_code,
    municipality_name,
    latitude,
    longitude,
    geography_status
  )
  select
    v_import.client_id,
    v_import.id,
    r.source_row_number,
    r.unit_name,
    r.neighborhood,
    r.city,
    r.state,
    r.postal_code,
    r.normalized_unit_name,
    r.normalized_neighborhood,
    r.normalized_city,
    r.normalized_state,
    r.normalized_postal_code,
    r.municipality_ibge_code,
    r.municipality_name,
    r.latitude,
    r.longitude,
    r.geography_status
  from jsonb_to_recordset(v_units) as r(
    source_row_number integer,
    unit_name text,
    neighborhood text,
    city text,
    state text,
    postal_code text,
    normalized_unit_name text,
    normalized_neighborhood text,
    normalized_city text,
    normalized_state text,
    normalized_postal_code text,
    municipality_ibge_code integer,
    municipality_name text,
    latitude double precision,
    longitude double precision,
    geography_status text
  );

  get diagnostics v_inserted = row_count;

  if v_inserted <> v_import.valid_rows then
    raise exception 'IMPORT_INSERT_COUNT_MISMATCH'
      using errcode = '22023';
  end if;

  update public.dashboard_network_unit_imports i
  set status = 'success',
      error_code = null,
      completed_at = now()
  where i.id = v_import.id;

  return jsonb_build_object(
    'status', 'success',
    'import_id', v_import.id,
    'client_id', v_import.client_id,
    'inserted_rows', v_inserted,
    'snapshot_replaced', true
  );
end;
$$;

revoke all on function public.replace_dashboard_network_units(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_dashboard_network_units(bigint, jsonb)
  to service_role;

create or replace function public.get_dashboard_network_units(
  p_client_slug text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_client_id bigint;
  v_units jsonb;
  v_cities jsonb;
  v_summary jsonb;
begin
  select dc.id
  into v_client_id
  from public.dashboard_clients dc
  where dc.slug = p_client_slug
    and dc.active = true
    and (select private.is_dashboard_client_member(dc.id));

  if v_client_id is null then
    raise exception 'DASHBOARD_CLIENT_NOT_FOUND_OR_FORBIDDEN'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'source_row_number', u.source_row_number,
        'unit_name', u.unit_name,
        'neighborhood', u.neighborhood,
        'city', u.city,
        'state', u.state,
        'postal_code', u.postal_code,
        'normalized_city', u.normalized_city,
        'normalized_state', u.normalized_state,
        'municipality_ibge_code', u.municipality_ibge_code,
        'municipality_name', u.municipality_name,
        'latitude', u.latitude,
        'longitude', u.longitude,
        'geography_status', u.geography_status
      )
      order by u.normalized_state, u.normalized_city,
        u.normalized_unit_name, u.id
    ),
    '[]'::jsonb
  )
  into v_units
  from public.dashboard_network_units u
  where u.client_id = v_client_id;

  with city_rows as (
    select
      u.normalized_city,
      u.normalized_state,
      coalesce(
        max(u.municipality_name) filter (where u.geography_status = 'resolved'),
        min(u.city)
      ) as city,
      count(*)::integer as unit_count,
      bool_and(u.geography_status = 'resolved') as resolved,
      case
        when bool_and(u.geography_status = 'resolved') then max(u.municipality_ibge_code)
        else null
      end as municipality_ibge_code,
      case
        when bool_and(u.geography_status = 'resolved') then max(u.latitude)
        else null
      end as latitude,
      case
        when bool_and(u.geography_status = 'resolved') then max(u.longitude)
        else null
      end as longitude
    from public.dashboard_network_units u
    where u.client_id = v_client_id
    group by u.normalized_city, u.normalized_state
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'city', c.city,
        'state', c.normalized_state,
        'normalized_city', c.normalized_city,
        'unit_count', c.unit_count,
        'resolved', c.resolved,
        'municipality_ibge_code', c.municipality_ibge_code,
        'latitude', c.latitude,
        'longitude', c.longitude
      )
      order by c.normalized_state, c.normalized_city
    ),
    '[]'::jsonb
  )
  into v_cities
  from city_rows c;

  with latest_import as (
    select i.*
    from public.dashboard_network_unit_imports i
    where i.client_id = v_client_id
      and i.status = 'success'
    order by i.completed_at desc, i.id desc
    limit 1
  ),
  unit_totals as (
    select
      count(*)::integer as total_units,
      count(distinct (u.normalized_city, u.normalized_state))::integer as total_cities,
      count(distinct (u.normalized_city, u.normalized_state))
        filter (where u.geography_status = 'unresolved')::integer as unresolved_cities
    from public.dashboard_network_units u
    where u.client_id = v_client_id
  )
  select jsonb_build_object(
    'total_units', t.total_units,
    'total_cities', t.total_cities,
    'unresolved_cities', t.unresolved_cities,
    'last_import_at', i.completed_at,
    'last_import', case
      when i.id is null then null
      else jsonb_build_object(
        'id', i.id,
        'filename', i.filename,
        'status', i.status,
        'total_rows', i.total_rows,
        'valid_rows', i.valid_rows,
        'duplicate_rows', i.duplicate_rows,
        'invalid_rows', i.invalid_rows,
        'unresolved_cities', i.unresolved_cities,
        'created_at', i.created_at,
        'completed_at', i.completed_at
      )
    end
  )
  into v_summary
  from unit_totals t
  left join latest_import i on true;

  return jsonb_build_object(
    'units', v_units,
    'cities', v_cities,
    'summary', v_summary,
    'headquarters', jsonb_build_object(
      'city', 'Campinas',
      'state', 'SP'
    )
  );
end;
$$;

revoke all on function public.get_dashboard_network_units(text)
  from public, anon;
grant execute on function public.get_dashboard_network_units(text)
  to authenticated;
