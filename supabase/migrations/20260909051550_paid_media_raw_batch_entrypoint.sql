-- Raw JSON-array entrypoint for Make's native Supabase API module.
-- Each row carries the same batch context; the function removes that context
-- and delegates to the canonical paid-media upsert functions.

create or replace function public.ingest_dashboard_paid_media_rows(jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce($1, '[]'::jsonb);
  v_first jsonb;
  v_rows jsonb;
  v_client_slug text;
  v_source text;
  v_record_kind text;
  v_group_kind text;
  v_idempotency_key text;
  v_range_start date;
  v_range_end date;
begin
  if jsonb_typeof(v_payload) <> 'array' or jsonb_array_length(v_payload) = 0 then
    raise exception 'payload must be a non-empty JSON array' using errcode = '22023';
  end if;

  v_first := v_payload -> 0;
  v_client_slug := nullif(v_first ->> 'client_slug', '');
  v_source := nullif(v_first ->> 'source', '');
  v_record_kind := nullif(v_first ->> 'record_kind', '');
  v_group_kind := nullif(v_first ->> 'group_kind', '');
  v_idempotency_key := nullif(v_first ->> 'idempotency_key', '');
  v_range_start := nullif(v_first ->> 'range_start', '')::date;
  v_range_end := nullif(v_first ->> 'range_end', '')::date;

  if v_client_slug is null
     or v_source is null
     or v_record_kind is null
     or v_idempotency_key is null
     or v_range_start is null
     or v_range_end is null then
    raise exception 'batch context is incomplete' using errcode = '22023';
  end if;

  if v_record_kind not in ('daily', 'campaign', 'ad_group', 'ad_set', 'ad') then
    raise exception 'unsupported record kind: %', v_record_kind using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload) as item(value)
    where item.value ->> 'client_slug' is distinct from v_client_slug
       or item.value ->> 'source' is distinct from v_source
       or item.value ->> 'record_kind' is distinct from v_record_kind
       or item.value ->> 'idempotency_key' is distinct from v_idempotency_key
       or item.value ->> 'range_start' is distinct from v_range_start::text
       or item.value ->> 'range_end' is distinct from v_range_end::text
  ) then
    raise exception 'batch context must be identical on every row' using errcode = '22023';
  end if;

  select jsonb_agg(
    item.value
      - 'client_slug'
      - 'source'
      - 'record_kind'
      - 'group_kind'
      - 'idempotency_key'
      - 'range_start'
      - 'range_end'
  )
  into v_rows
  from jsonb_array_elements(v_payload) as item(value);

  if v_record_kind in ('ad_group', 'ad_set') then
    if v_group_kind is distinct from v_record_kind then
      raise exception 'group kind must match record kind' using errcode = '22023';
    end if;

    return public.upsert_dashboard_paid_media_group_batch(
      v_client_slug,
      v_source,
      v_group_kind,
      v_idempotency_key,
      v_range_start,
      v_range_end,
      v_rows
    );
  end if;

  return public.upsert_dashboard_paid_media_batch(
    v_client_slug,
    v_source,
    v_idempotency_key,
    v_range_start,
    v_range_end,
    case when v_record_kind = 'daily' then v_rows else '[]'::jsonb end,
    case when v_record_kind = 'campaign' then v_rows else '[]'::jsonb end,
    case when v_record_kind = 'ad' then v_rows else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.ingest_dashboard_paid_media_rows(jsonb)
  from public, anon, authenticated;

grant execute on function public.ingest_dashboard_paid_media_rows(jsonb)
  to service_role;

;
