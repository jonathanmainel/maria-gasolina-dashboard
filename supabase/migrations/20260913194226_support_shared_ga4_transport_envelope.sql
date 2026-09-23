
create or replace function private.normalize_ga4_acquisition_rows(p_rows jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'channel_group', coalesce(item->>'channel_group', item#>>'{extra_metrics,channel_group}'),
      'source_medium', coalesce(item->>'source_medium', item#>>'{extra_metrics,source_medium}'),
      'key_events', coalesce(item->'key_events', item->'conversions', '0'::jsonb)
    )
  ),'[]'::jsonb)
  from jsonb_array_elements(p_rows) item
$$;

create or replace function private.normalize_ga4_event_rows(p_rows jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'event_name', coalesce(item->>'event_name', item#>>'{extra_metrics,event_name}'),
      'channel_group', coalesce(item->>'channel_group', item#>>'{extra_metrics,channel_group}'),
      'source_medium', coalesce(item->>'source_medium', item#>>'{extra_metrics,source_medium}'),
      'event_count', coalesce(item->'event_count', item->'events', '0'::jsonb),
      'key_events', coalesce(item->'key_events', item->'conversions', '0'::jsonb)
    )
  ),'[]'::jsonb)
  from jsonb_array_elements(p_rows) item
$$;

do $fix$
declare v_definition text;
begin
  select pg_get_functiondef('public.upsert_dashboard_ga4_acquisition_batch(text,text,text,date,date,jsonb)'::regprocedure) into v_definition;
  if position('normalize_ga4_acquisition_rows' in v_definition)=0 then
    v_definition:=replace(v_definition,
      'if jsonb_typeof(v_rows) <> ''array'' or jsonb_array_length(v_rows) = 0 then',
      'v_rows := private.normalize_ga4_acquisition_rows(v_rows);' || chr(10) || '  if jsonb_typeof(v_rows) <> ''array'' or jsonb_array_length(v_rows) = 0 then');
    execute v_definition;
  end if;

  select pg_get_functiondef('public.upsert_dashboard_ga4_event_batch(text,text,text,date,date,jsonb)'::regprocedure) into v_definition;
  if position('normalize_ga4_event_rows' in v_definition)=0 then
    v_definition:=replace(v_definition,
      'if jsonb_typeof(v_rows) <> ''array'' or jsonb_array_length(v_rows) = 0 then',
      'v_rows := private.normalize_ga4_event_rows(v_rows);' || chr(10) || '  if jsonb_typeof(v_rows) <> ''array'' or jsonb_array_length(v_rows) = 0 then');
    execute v_definition;
  end if;
end;$fix$;
;
