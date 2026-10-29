-- Additive media operation. Apply to isolated homologation only under this approval.
begin;
alter table public.dashboard_automation_runs
 add column operation text not null default 'metrics' check(operation in ('metrics','previews')),
 add column preview_selection jsonb,
 add column selection_fingerprint text,
 add column preview_results jsonb;
alter table public.dashboard_automation_runs add constraint dashboard_preview_operation
 check (((operation='metrics' and preview_selection is null and selection_fingerprint is null)
 or (operation='previews' and source='meta_ads' and trigger='manual' and account_id is not null
 and jsonb_typeof(preview_selection)='object' and selection_fingerprint ~ '^[a-f0-9]{64}$')) is true);

create function private.protect_dashboard_preview_reservation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.operation is distinct from old.operation or new.preview_selection is distinct from old.preview_selection
 or new.selection_fingerprint is distinct from old.selection_fingerprint
 or ((old.operation='previews' or new.operation='previews') and
 (new.client_id,new.source,new.account_id,new.range_start,new.range_end,new.request_key,new.requested_by)
 is distinct from (old.client_id,old.source,old.account_id,old.range_start,old.range_end,old.request_key,old.requested_by))
 then raise exception 'IMMUTABLE_PREVIEW_RESERVATION' using errcode='22023'; end if;
 if old.operation='previews' and old.preview_results is not null and new.preview_results is distinct from old.preview_results
 then raise exception 'IMMUTABLE_PREVIEW_RECEIPT' using errcode='22023'; end if;
 if new.operation='previews' and new.status='success' and
 (new.preview_results is null or new.preview_results->>'status' is distinct from 'success'
 or new.counts is distinct from new.preview_results->'counts')
 then raise exception 'UNVERIFIED_PREVIEW_SUCCESS' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.protect_dashboard_preview_reservation() from public,anon,authenticated;
create trigger protect_dashboard_preview_reservation before update on public.dashboard_automation_runs
for each row execute function private.protect_dashboard_preview_reservation();

-- Preserve the old RPC signature and implementation, with an operation-binding check.
alter function public.reserve_dashboard_sync(bigint,text,text,date,date,uuid,uuid) rename to reserve_dashboard_metrics_sync_legacy;
create function public.reserve_dashboard_sync(p_client_id bigint,p_source text,p_trigger text,p_start date,p_end date,
 p_user_id uuid default null,p_request_key uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text||':'||p_source,0));
 if exists(select 1 from public.dashboard_automation_runs where client_id=p_client_id and source=p_source
 and request_key=p_request_key and operation<>'metrics') then
 raise exception 'RESERVATION_OPERATION_MISMATCH' using errcode='22023'; end if;
 return public.reserve_dashboard_metrics_sync_legacy(p_client_id,p_source,p_trigger,p_start,p_end,p_user_id,p_request_key);
end $$;

create function public.request_dashboard_preview_sync(p_client_slug text,p_user_id uuid,p_request_key uuid,
 p_ad_ids text[],p_assets jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 v_client bigint; v_ids text[]; v_account text; v_count integer; v_accounts integer;
 v_assets jsonb; v_selection jsonb; v_run public.dashboard_automation_runs%rowtype;
 v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_next timestamptz; v_dispatch bigint;
begin
 select c.id into v_client from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
 where c.slug=p_client_slug and c.active and m.user_id=p_user_id and m.role='admin';
 if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;
 if p_request_key is null or p_ad_ids is null or cardinality(p_ad_ids) not between 1 and 50
 or exists(select 1 from unnest(p_ad_ids) x where x is null or x !~ '^[0-9]{1,30}$')
 or (select count(distinct x) from unnest(p_ad_ids) x)<>cardinality(p_ad_ids)
 or jsonb_typeof(p_assets) is distinct from 'array' then raise exception 'INVALID_PREVIEW_SELECTION' using errcode='22023'; end if;
 select array_agg(x order by x collate "C") into v_ids from unnest(p_ad_ids) x;
 if jsonb_array_length(p_assets)>cardinality(v_ids)
 or exists(select 1 from jsonb_array_elements(p_assets) a where jsonb_typeof(a)<>'object'
 or a->>'ad_id' is null or not (a->>'ad_id'=any(v_ids)) or a->>'sha256' is null or a->>'sha256' !~ '^[a-f0-9]{64}$'
 or a->>'creative_id' is null or a->>'creative_id' !~ '^[0-9]{1,30}$'
 or (a ? 'video_id' and (a->>'video_id' is null or a->>'video_id' !~ '^[0-9]{1,30}$'))
 or (select count(*) from jsonb_object_keys(a) k where k not in ('ad_id','creative_id','video_id','sha256'))>0)
 or (select count(distinct a->>'ad_id') from jsonb_array_elements(p_assets) a)<>jsonb_array_length(p_assets)
 then raise exception 'INVALID_PREVIEW_ASSETS' using errcode='22023'; end if;
 select coalesce(jsonb_agg(a order by a->>'ad_id'),'[]') into v_assets from jsonb_array_elements(p_assets) a;
 perform pg_advisory_xact_lock(hashtextextended(v_client::text||':meta_ads',0));
 select * into v_run from public.dashboard_automation_runs where client_id=v_client and source='meta_ads' and request_key=p_request_key;
 if found then
  if v_run.operation<>'previews' or v_run.preview_selection->'ad_ids'<>to_jsonb(v_ids)
  or v_run.preview_selection->'approved_assets'<>v_assets then raise exception 'RESERVATION_PAYLOAD_MISMATCH' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','existing','run_id',v_run.id)));
 end if;
 select count(*),count(distinct c.account_id),min(c.account_id) into v_count,v_accounts,v_account
 from public.dashboard_creative_previews c where c.client_id=v_client and c.source='meta_ads'
 and c.entity_type='ad' and c.entity_id=any(v_ids) and c.creative_id is not null
 and exists(select 1 from public.dashboard_source_accounts a where a.client_id=c.client_id and a.source=c.source
 and a.account_id=c.account_id and a.active and a.automation_enabled);
 if v_count<>cardinality(v_ids) or v_accounts<>1 then raise exception 'PREVIEW_SCOPE_FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements(v_assets) a join public.dashboard_creative_previews c
 on c.client_id=v_client and c.source='meta_ads' and c.entity_type='ad' and c.entity_id=a->>'ad_id'
 where c.creative_id is distinct from a->>'creative_id' or (a ? 'video_id' and c.metadata->>'video_id' is distinct from a->>'video_id'))
 then raise exception 'PREVIEW_ASSET_MISMATCH' using errcode='22023'; end if;
 select jsonb_build_object('ad_ids',to_jsonb(v_ids),'approved_assets',v_assets,'ads',jsonb_agg(jsonb_build_object(
 'ad_id',c.entity_id,'creative_id',c.creative_id,'video_id',c.metadata->>'video_id','asset_key',c.metadata->>'preview_asset_key',
 'previous_sha256',c.preview_sha256,'previous_path',c.preview_storage_path,'previous_updated_at',c.updated_at) order by c.entity_id))
 into v_selection from public.dashboard_creative_previews c where c.client_id=v_client and c.source='meta_ads'
 and c.entity_type='ad' and c.entity_id=any(v_ids);
 select * into v_run from public.dashboard_automation_runs where client_id=v_client and source='meta_ads'
 and status in ('queued','running','indeterminate') order by requested_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','active','run_id',v_run.id))); end if;
 select max(requested_at)+interval '5 minutes' into v_next from public.dashboard_automation_runs
 where client_id=v_client and source='meta_ads' and trigger='manual';
 if v_next>clock_timestamp() then return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','cooldown','retry_at',v_next))); end if;
 insert into public.dashboard_automation_runs(client_id,source,trigger,range_start,range_end,status,requested_by,request_key,
 period_mode,operation,account_id,preview_selection,selection_fingerprint)
 values(v_client,'meta_ads','manual',v_today-7,v_today,'queued',p_user_id,p_request_key,'including_today','previews',v_account,
 v_selection,encode(sha256(convert_to(v_selection::text,'UTF8')),'hex')) returning * into v_run;
 v_dispatch:=private.dispatch_dashboard_sync(array[v_run.id]);
 update public.dashboard_automation_runs set dispatch_id=v_dispatch where id=v_run.id;
 return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','accepted','run_id',v_run.id)),
 'range_start',v_today-7,'range_end',v_today);
end $$;

alter function public.start_dashboard_sync_run(uuid) rename to start_dashboard_metrics_sync_legacy;
create function public.start_dashboard_sync_run(p_run_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_run public.dashboard_automation_runs%rowtype; v_claim jsonb;
begin
 select * into v_run from public.dashboard_automation_runs where id=p_run_id for update;
 if v_run.operation='previews' and not exists(select 1 from public.dashboard_source_accounts a
 where a.client_id=v_run.client_id and a.source='meta_ads' and a.account_id=v_run.account_id and a.active and a.automation_enabled) then
 update public.dashboard_automation_runs set status='failed',error_code='AUTHORIZATION_CHANGED',completed_at=clock_timestamp()
 where id=p_run_id and status='queued'; return null; end if;
 v_claim:=public.start_dashboard_metrics_sync_legacy(p_run_id);
 if v_claim is null then return null; end if;
 return v_claim||jsonb_build_object('operation',v_run.operation,'account_id',v_run.account_id,
 'preview_selection',v_run.preview_selection,'selection_fingerprint',v_run.selection_fingerprint);
end $$;

-- Existing metric callers keep their signature; they can never claim preview work.
create or replace function public.begin_dashboard_sync_collection(p_run_id uuid,p_client_id bigint,p_source text,p_start date,p_end date)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
 update public.dashboard_automation_runs set collector_started_at=clock_timestamp()
 where id=p_run_id and client_id=p_client_id and source=p_source and range_start=p_start and range_end=p_end
 and operation='metrics' and status='running' and worker_started_at is not null and collector_started_at is null returning id into v_id;
 return v_id is not null;
end $$;

create function public.begin_dashboard_preview_collection(p_run_id uuid,p_client_id bigint,p_account_id text,
 p_start date,p_end date,p_selection jsonb,p_fingerprint text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_run public.dashboard_automation_runs%rowtype;
begin
 select * into v_run from public.dashboard_automation_runs where id=p_run_id for update;
 if not found or v_run.operation<>'previews' or v_run.source<>'meta_ads' or v_run.client_id<>p_client_id
 or v_run.account_id is distinct from p_account_id or v_run.range_start<>p_start or v_run.range_end<>p_end
 or v_run.preview_selection is distinct from p_selection or v_run.selection_fingerprint is distinct from p_fingerprint
 or v_run.status<>'running' or v_run.worker_started_at is null or v_run.collector_started_at is not null then return false; end if;
 if not exists(select 1 from public.dashboard_client_users m join public.dashboard_clients c on c.id=m.client_id
 where m.client_id=p_client_id and m.user_id=v_run.requested_by and m.role='admin' and c.active)
 or not exists(select 1 from public.dashboard_source_accounts a where a.client_id=p_client_id and a.source='meta_ads'
 and a.account_id=p_account_id and a.active and a.automation_enabled) then return false; end if;
 if exists(select 1 from jsonb_array_elements(p_selection->'ads') a left join public.dashboard_creative_previews c
 on c.client_id=p_client_id and c.source='meta_ads' and c.account_id=p_account_id and c.entity_type='ad' and c.entity_id=a->>'ad_id'
 where c.id is null or c.creative_id is distinct from a->>'creative_id'
 or c.preview_sha256 is distinct from a->>'previous_sha256' or c.preview_storage_path is distinct from a->>'previous_path'
 or c.metadata->>'video_id' is distinct from a->>'video_id'
 or c.metadata->>'preview_asset_key' is distinct from a->>'asset_key'
 or to_jsonb(c.updated_at) is distinct from a->'previous_updated_at') then return false; end if;
 update public.dashboard_automation_runs set collector_started_at=clock_timestamp() where id=p_run_id;
 return true;
end $$;

create function public.verify_dashboard_preview_results(p_run_id uuid,p_results jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_run public.dashboard_automation_runs%rowtype; r jsonb; a jsonb; c public.dashboard_creative_previews%rowtype;
 v_failed integer:=0; v_updated integer:=0; v_preserved integer:=0; v_result jsonb;
 v_short integer; v_long integer; v_ratio numeric; v_min_long integer;
begin
 select * into v_run from public.dashboard_automation_runs where id=p_run_id for update;
 if not found or v_run.operation<>'previews' or v_run.status not in ('running','indeterminate') or v_run.collector_started_at is null
 or jsonb_typeof(p_results) is distinct from 'array' then return null; end if;
 if jsonb_array_length(p_results)<>jsonb_array_length(v_run.preview_selection->'ads')
 or (select count(distinct x->>'ad_id') from jsonb_array_elements(p_results) x)<>jsonb_array_length(p_results) then return null; end if;
 for r in select * from jsonb_array_elements(p_results) loop
  select x into a from jsonb_array_elements(v_run.preview_selection->'ads') x where x->>'ad_id'=r->>'ad_id';
  if a is null or r->>'outcome' is null or r->>'outcome' not in ('updated','preserved_adequate','preserved_inadequate','failed_download','failed_storage','failed_database','cas_conflict') then return null; end if;
  select * into c from public.dashboard_creative_previews where client_id=v_run.client_id and source='meta_ads'
   and account_id=v_run.account_id and entity_type='ad' and entity_id=r->>'ad_id';
  if not found or c.preview_storage_path is distinct from r->>'path' or c.preview_sha256 is distinct from r->>'sha256'
   or c.preview_mime_type is distinct from r->>'mime' then return null; end if;
  if r->>'outcome'='updated' then
   v_short:=least((r->>'width')::integer,(r->>'height')::integer);
   v_long:=greatest((r->>'width')::integer,(r->>'height')::integer);
   if v_short is null or v_short<720 or v_long is null or v_long<=0 then return null; end if;
   v_ratio:=v_short::numeric/v_long;
   v_min_long:=case when abs(v_ratio/(9.0/16)-1)<=0.035 then 1280
    when abs(v_ratio-1)<=0.035 then 720 when abs(v_ratio/0.8-1)<=0.035 then 900 else ceil(720/v_ratio) end;
   if c.creative_id is distinct from a->>'creative_id' or c.metadata->>'video_id' is distinct from a->>'video_id'
    or (a->>'asset_key' is not null and c.metadata->>'preview_asset_key' is distinct from a->>'asset_key')
    or c.preview_sha256 is not distinct from a->>'previous_sha256'
    or c.preview_storage_path is null or c.preview_sha256 is null
    or position(left(c.preview_sha256,12) in c.preview_storage_path)=0
    or c.preview_storage_path not like v_run.client_id::text||'/meta_ads/'||v_run.account_id||'/ad/'||(a->>'ad_id')||'/%'
    or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id where b.id='dashboard-creatives' and not b.public and o.name=c.preview_storage_path)
    or c.metadata->>'preview_width' is distinct from r->>'width' or c.metadata->>'preview_height' is distinct from r->>'height'
    or v_long<v_min_long
    or exists(select 1 from jsonb_array_elements(v_run.preview_selection->'approved_assets') x where x->>'ad_id'=a->>'ad_id' and x->>'sha256' is distinct from c.preview_sha256)
    then return null; end if;
   v_updated:=v_updated+1;
  elsif r->>'outcome' in ('preserved_adequate','preserved_inadequate') then
   if c.preview_sha256 is distinct from a->>'previous_sha256' or c.preview_storage_path is distinct from a->>'previous_path' then return null; end if;
   v_preserved:=v_preserved+1;
  else v_failed:=v_failed+1; end if;
 end loop;
 v_result:=jsonb_build_object('status',case when v_failed>0 then 'failed' else 'success' end,
 'counts',jsonb_build_object('updated',v_updated,'preserved',v_preserved,'failed',v_failed),'results',p_results);
 if v_run.preview_results is not null and v_run.preview_results is distinct from v_result then return null; end if;
 update public.dashboard_automation_runs set preview_results=v_result where id=p_run_id;
 return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

revoke all on function public.reserve_dashboard_sync(bigint,text,text,date,date,uuid,uuid),
 public.request_dashboard_preview_sync(text,uuid,uuid,text[],jsonb),public.start_dashboard_sync_run(uuid),
 public.begin_dashboard_preview_collection(uuid,bigint,text,date,date,jsonb,text),public.verify_dashboard_preview_results(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_dashboard_sync(bigint,text,text,date,date,uuid,uuid),
 public.request_dashboard_preview_sync(text,uuid,uuid,text[],jsonb),public.start_dashboard_sync_run(uuid),
 public.begin_dashboard_preview_collection(uuid,bigint,text,date,date,jsonb,text),public.verify_dashboard_preview_results(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
