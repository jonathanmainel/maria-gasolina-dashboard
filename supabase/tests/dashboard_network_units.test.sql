begin;

select '1..23';

select case when exists (
  select 1
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'dashboard_network_unit_imports'
    and c.relrowsecurity
) then 'ok 1 - imports table has RLS enabled'
else 'not ok 1 - imports table has RLS enabled' end;

select case when exists (
  select 1
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'dashboard_network_units'
    and c.relrowsecurity
) then 'ok 2 - units table has RLS enabled'
else 'not ok 2 - units table has RLS enabled' end;

select case when not pg_catalog.has_function_privilege(
  'authenticated',
  'public.replace_dashboard_network_units(bigint,jsonb)',
  'execute'
) then 'ok 3 - authenticated cannot execute replace RPC'
else 'not ok 3 - authenticated cannot execute replace RPC' end;

select case when not pg_catalog.has_function_privilege(
  'anon',
  'public.replace_dashboard_network_units(bigint,jsonb)',
  'execute'
) then 'ok 4 - anon cannot execute replace RPC'
else 'not ok 4 - anon cannot execute replace RPC' end;

select case when pg_catalog.has_function_privilege(
  'service_role',
  'public.replace_dashboard_network_units(bigint,jsonb)',
  'execute'
) then 'ok 5 - service role can execute replace RPC'
else 'not ok 5 - service role can execute replace RPC' end;

select case when pg_catalog.has_function_privilege(
  'authenticated',
  'public.get_dashboard_network_units(text)',
  'execute'
) then 'ok 6 - authenticated can execute read RPC'
else 'not ok 6 - authenticated can execute read RPC' end;

select case when not pg_catalog.has_function_privilege(
  'anon',
  'public.get_dashboard_network_units(text)',
  'execute'
) then 'ok 7 - anon cannot execute read RPC'
else 'not ok 7 - anon cannot execute read RPC' end;

set local role service_role;

create temporary table network_test_context as
select dcu.user_id
from public.dashboard_client_users dcu
join public.dashboard_clients dc on dc.id = dcu.client_id
where dc.slug = 'maria-gasolina'
order by dcu.created_at
limit 1;

grant select on network_test_context to authenticated;

insert into public.dashboard_clients (slug, name)
values
  ('network-units-test', 'Network Units Test'),
  ('network-units-other', 'Network Units Other');

insert into public.dashboard_client_users (client_id, user_id, role)
select dc.id, ctx.user_id, 'viewer'
from public.dashboard_clients dc
cross join network_test_context ctx
where dc.slug = 'network-units-test';

insert into public.dashboard_network_unit_imports (
  client_id, filename, status, total_rows, valid_rows, duplicate_rows,
  invalid_rows, unresolved_cities, geography_source,
  geography_source_commit, geography_source_checksum
)
select
  dc.id, 'other.xlsx', 'processing', 1, 1, 0, 0, 0,
  'kelvins/municipios-brasileiros',
  '503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861',
  'BEE0AC7CD625D55DAC23BD546DC0F9A4830397259C3DE05571A3414CB835011B'
from public.dashboard_clients dc
where dc.slug = 'network-units-other';

set local role service_role;

select public.replace_dashboard_network_units(
  (
    select i.id
    from public.dashboard_network_unit_imports i
    join public.dashboard_clients dc on dc.id = i.client_id
    where dc.slug = 'network-units-other'
      and i.filename = 'other.xlsx'
  ),
  '[{"source_row_number":2,"unit_name":"Other","neighborhood":"Centro","city":"Campinas","state":"SP","postal_code":"13091-704","normalized_unit_name":"other","normalized_neighborhood":"centro","normalized_city":"campinas","normalized_state":"SP","normalized_postal_code":"13091704","municipality_ibge_code":3509502,"municipality_name":"Campinas","latitude":-22.9053,"longitude":-47.0659,"geography_status":"resolved"}]'::jsonb
);

insert into public.dashboard_network_unit_imports (
  client_id, filename, status, total_rows, valid_rows, duplicate_rows,
  invalid_rows, unresolved_cities, geography_source,
  geography_source_commit, geography_source_checksum
)
select
  dc.id, 'first.xlsx', 'processing', 2, 2, 0, 0, 0,
  'kelvins/municipios-brasileiros',
  '503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861',
  'BEE0AC7CD625D55DAC23BD546DC0F9A4830397259C3DE05571A3414CB835011B'
from public.dashboard_clients dc
where dc.slug = 'network-units-test';

set local role service_role;

select public.replace_dashboard_network_units(
  (
    select i.id
    from public.dashboard_network_unit_imports i
    join public.dashboard_clients dc on dc.id = i.client_id
    where dc.slug = 'network-units-test'
      and i.filename = 'first.xlsx'
  ),
  '[{"source_row_number":2,"unit_name":"ACQUA GALLERIA","neighborhood":"Fazenda São Quirino","city":"Campinas","state":"SP","postal_code":"13091-702","normalized_unit_name":"acqua galleria","normalized_neighborhood":"fazenda sao quirino","normalized_city":"campinas","normalized_state":"SP","normalized_postal_code":"13091702","municipality_ibge_code":3509502,"municipality_name":"Campinas","latitude":-22.9053,"longitude":-47.0659,"geography_status":"resolved"},{"source_row_number":3,"unit_name":"UNIDADE PAULINIA","neighborhood":"Centro","city":"Paulínia","state":"SP","postal_code":"13140-000","normalized_unit_name":"unidade paulinia","normalized_neighborhood":"centro","normalized_city":"paulinia","normalized_state":"SP","normalized_postal_code":"13140000","municipality_ibge_code":3536505,"municipality_name":"Paulínia","latitude":-22.7542,"longitude":-47.1488,"geography_status":"resolved"}]'::jsonb
);

select 'ok 8 - valid import replaces the snapshot';

select case when (
  select count(*)
  from public.dashboard_network_units u
  join public.dashboard_clients dc on dc.id = u.client_id
  where dc.slug = 'network-units-test'
) = 2 then 'ok 9 - valid import writes two deduplicated units'
else 'not ok 9 - valid import writes two deduplicated units' end;

select case when (
  select i.status
  from public.dashboard_network_unit_imports i
  join public.dashboard_clients dc on dc.id = i.client_id
  where dc.slug = 'network-units-test'
    and i.filename = 'first.xlsx'
) = 'success' then 'ok 10 - successful import is audited'
else 'not ok 10 - successful import is audited' end;

set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  (
    select jsonb_build_object(
      'sub', ctx.user_id::text,
      'role', 'authenticated'
    )::text
    from network_test_context ctx
  ),
  true
);

select case when (
  public.get_dashboard_network_units('network-units-test')
    #>> '{summary,total_units}'
)::integer = 2 then 'ok 11 - member can read both units'
else 'not ok 11 - member can read both units' end;

select case when (
  public.get_dashboard_network_units('network-units-test')
    #>> '{summary,total_cities}'
)::integer = 2 then 'ok 12 - read RPC aggregates by city and state'
else 'not ok 12 - read RPC aggregates by city and state' end;

select case when (
  public.get_dashboard_network_units('network-units-test')
    #>> '{headquarters,city}'
) = 'Campinas' then 'ok 13 - headquarters is returned separately'
else 'not ok 13 - headquarters is returned separately' end;

select case when (
  public.get_dashboard_network_units('network-units-test')
    #>> '{summary,total_units}'
)::integer = 2 then 'ok 14 - headquarters does not add an artificial unit'
else 'not ok 14 - headquarters does not add an artificial unit' end;

select case when not (
  public.get_dashboard_network_units('network-units-test') ? 'leadCities'
) then 'ok 15 - read contract has no leadCities concept'
else 'not ok 15 - read contract has no leadCities concept' end;

do $$
begin
  begin
    insert into public.dashboard_network_units (
      client_id, import_id, source_row_number, unit_name, neighborhood, city,
      state, postal_code, normalized_unit_name, normalized_neighborhood,
      normalized_city, normalized_state, normalized_postal_code, geography_status
    ) values (
      1, 1, 99, 'x', 'x', 'x', 'SP', '00000000',
      'x', 'x', 'x', 'SP', '00000000', 'unresolved'
    );
    raise exception 'authenticated direct write unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
select 'ok 16 - authenticated cannot write units directly';

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

do $$
begin
  begin
    perform public.get_dashboard_network_units('network-units-test');
    raise exception 'non-member read unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
select 'ok 17 - non-member cannot read client units';

reset role;
set local role anon;

do $$
begin
  begin
    perform public.get_dashboard_network_units('network-units-test');
    raise exception 'anon read unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
select 'ok 18 - anon cannot execute read RPC';

reset role;
set local role service_role;

insert into public.dashboard_network_unit_imports (
  client_id, filename, status, total_rows, valid_rows, duplicate_rows,
  invalid_rows, unresolved_cities, geography_source,
  geography_source_commit, geography_source_checksum
)
select
  dc.id, 'broken.xlsx', 'processing', 1, 1, 0, 0, 0,
  'kelvins/municipios-brasileiros',
  '503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861',
  'BEE0AC7CD625D55DAC23BD546DC0F9A4830397259C3DE05571A3414CB835011B'
from public.dashboard_clients dc
where dc.slug = 'network-units-test';

do $$
declare
  import_id bigint;
begin
  select i.id into import_id
  from public.dashboard_network_unit_imports i
  join public.dashboard_clients dc on dc.id = i.client_id
  where dc.slug = 'network-units-test'
    and i.filename = 'broken.xlsx';

  begin
    perform public.replace_dashboard_network_units(
      import_id,
      '[{"source_row_number":2,"unit_name":"Broken","neighborhood":"Centro","city":"Campinas","state":"SP","postal_code":"13091-702","normalized_unit_name":"broken","normalized_neighborhood":"centro","normalized_city":"campinas","normalized_state":"SP","normalized_postal_code":"13091702","municipality_ibge_code":3509502,"municipality_name":"Campinas","latitude":null,"longitude":null,"geography_status":"resolved"}]'::jsonb
    );
    raise exception 'invalid replacement unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end;
$$;
select 'ok 19 - failed replacement raises a constraint error';

select case when (
  select count(*)
  from public.dashboard_network_units u
  join public.dashboard_clients dc on dc.id = u.client_id
  where dc.slug = 'network-units-test'
) = 2 then 'ok 20 - failed replacement preserves previous snapshot'
else 'not ok 20 - failed replacement preserves previous snapshot' end;

insert into public.dashboard_network_unit_imports (
  client_id, filename, status, total_rows, valid_rows, duplicate_rows,
  invalid_rows, unresolved_cities, geography_source,
  geography_source_commit, geography_source_checksum
)
select
  dc.id, 'unresolved.xlsx', 'processing', 1, 1, 0, 0, 1,
  'kelvins/municipios-brasileiros',
  '503e2f70bbf1b4b7ec0b1f68b09086ccc38fe861',
  'BEE0AC7CD625D55DAC23BD546DC0F9A4830397259C3DE05571A3414CB835011B'
from public.dashboard_clients dc
where dc.slug = 'network-units-test';

set local role service_role;

select public.replace_dashboard_network_units(
  (
    select i.id
    from public.dashboard_network_unit_imports i
    join public.dashboard_clients dc on dc.id = i.client_id
    where dc.slug = 'network-units-test'
      and i.filename = 'unresolved.xlsx'
  ),
  '[{"source_row_number":2,"unit_name":"Unknown","neighborhood":"Centro","city":"Cidade que não existe","state":"SP","postal_code":"13091-703","normalized_unit_name":"unknown","normalized_neighborhood":"centro","normalized_city":"cidade que nao existe","normalized_state":"SP","normalized_postal_code":"13091703","municipality_ibge_code":null,"municipality_name":null,"latitude":null,"longitude":null,"geography_status":"unresolved"}]'::jsonb
);

select case when (
  select u.geography_status
  from public.dashboard_network_units u
  join public.dashboard_clients dc on dc.id = u.client_id
  where dc.slug = 'network-units-test'
) = 'unresolved' then 'ok 21 - unresolved city is imported'
else 'not ok 21 - unresolved city is imported' end;

select case when (
  select u.latitude is null and u.longitude is null
  from public.dashboard_network_units u
  join public.dashboard_clients dc on dc.id = u.client_id
  where dc.slug = 'network-units-test'
) then 'ok 22 - unresolved city receives no invented coordinates'
else 'not ok 22 - unresolved city receives no invented coordinates' end;

select case when (
  select count(*)
  from public.dashboard_network_units u
  join public.dashboard_clients dc on dc.id = u.client_id
  where dc.slug = 'network-units-other'
) = 1 then 'ok 23 - snapshots remain isolated by client'
else 'not ok 23 - snapshots remain isolated by client' end;

rollback;
