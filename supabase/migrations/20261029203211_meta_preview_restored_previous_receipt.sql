-- Add an explicit, audited restoration receipt. Normal HD validation is unchanged.
-- Additive correction after isolated runtime review; no schema, RLS or grant change.
begin;
create or replace function public.verify_dashboard_preview_results(p_run_id uuid,p_results jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_run public.dashboard_automation_runs%rowtype; r jsonb; a jsonb; c public.dashboard_creative_previews%rowtype;
 v_failed integer:=0; v_updated integer:=0; v_preserved integer:=0; v_result jsonb;
 v_restored integer:=0; v_origin public.dashboard_automation_runs%rowtype; v_old jsonb; v_upgrade jsonb;
 v_short integer; v_long integer; v_ratio numeric; v_min_long integer;
begin
 select * into v_run from public.dashboard_automation_runs where id=p_run_id for update;
 if not found or v_run.operation<>'previews' or v_run.status not in ('running','indeterminate') or v_run.collector_started_at is null
 or jsonb_typeof(p_results) is distinct from 'array' then return null; end if;
 if jsonb_array_length(p_results)<>jsonb_array_length(v_run.preview_selection->'ads')
 or (select count(distinct x->>'ad_id') from jsonb_array_elements(p_results) x)<>jsonb_array_length(p_results) then return null; end if;
 for r in select * from jsonb_array_elements(p_results) loop
  select x into a from jsonb_array_elements(v_run.preview_selection->'ads') x where x->>'ad_id'=r->>'ad_id';
  if a is null or r->>'outcome' is null or r->>'outcome' not in ('updated','restored_previous','preserved_adequate','preserved_inadequate','failed_download','failed_storage','failed_database','cas_conflict') then return null; end if;
  select * into c from public.dashboard_creative_previews where client_id=v_run.client_id and source='meta_ads'
   and account_id=v_run.account_id and entity_type='ad' and entity_id=r->>'ad_id';
  if not found or c.preview_storage_path is distinct from r->>'path' or c.preview_sha256 is distinct from r->>'sha256'
   or c.preview_mime_type is distinct from r->>'mime'
   or c.metadata->>'preview_width' is distinct from r->>'width'
   or c.metadata->>'preview_height' is distinct from r->>'height' then return null; end if;
  if r->>'outcome' in ('updated','preserved_adequate') then
   v_short:=least((r->>'width')::integer,(r->>'height')::integer);
   v_long:=greatest((r->>'width')::integer,(r->>'height')::integer);
   if v_short is null or v_short<720 or v_long is null or v_long<=0 then return null; end if;
   v_ratio:=v_short::numeric/v_long;
   v_min_long:=case when abs(v_ratio/(9.0/16)-1)<=0.035 then 1280
    when abs(v_ratio-1)<=0.035 then 720 when abs(v_ratio/0.8-1)<=0.035 then 900 else ceil(720/v_ratio) end;
   if v_long<v_min_long then return null; end if;
  end if;
  if r->>'outcome'='restored_previous' then
   -- A restore is a separate intent: its target must be the version replaced by
   -- an earlier terminally verified upgrade of this exact client/ad/video.
   select * into v_origin from public.dashboard_automation_runs
     where id=(r->>'origin_run_id')::uuid;
   if not found or v_origin.id=v_run.id or v_origin.status not in ('success','failed')
    or v_origin.operation<>'previews' or v_origin.source<>'meta_ads'
    or v_origin.client_id<>v_run.client_id or v_origin.account_id is distinct from v_run.account_id
    or v_origin.collector_started_at is null or v_origin.completed_at is null
    or v_origin.requested_at>=v_run.requested_at or v_origin.preview_results->>'status' is distinct from v_origin.status
    then return null; end if;
   select x into v_old from jsonb_array_elements(v_origin.preview_selection->'ads') x where x->>'ad_id'=r->>'ad_id';
   select x into v_upgrade from jsonb_array_elements(v_origin.preview_results->'results') x where x->>'ad_id'=r->>'ad_id';
   if v_old is null or v_upgrade is null or v_upgrade->>'outcome' is distinct from 'updated'
    or v_upgrade->>'path' is distinct from a->>'previous_path'
    or v_upgrade->>'sha256' is distinct from a->>'previous_sha256'
    or c.preview_storage_path is distinct from v_old->>'previous_path'
    or c.preview_sha256 is distinct from v_old->>'previous_sha256'
    or c.preview_sha256 is not distinct from a->>'previous_sha256'
    or c.creative_id is distinct from a->>'creative_id' or c.creative_id is distinct from v_old->>'creative_id'
    or c.metadata->>'video_id' is distinct from a->>'video_id'
    or c.metadata->>'video_id' is distinct from v_old->>'video_id'
    or c.metadata->>'preview_asset_key' is distinct from v_old->>'asset_key'
    or c.preview_sha256 is null or c.preview_sha256 !~ '^[a-f0-9]{64}$'
    or c.preview_mime_type not in ('image/jpeg','image/png','image/webp','image/gif')
    or c.preview_storage_path is null
    or c.preview_storage_path not like v_run.client_id::text||'/meta_ads/'||v_run.account_id||'/ad/'||(a->>'ad_id')||'/%'
    or position('..' in c.preview_storage_path)>0
    or c.metadata->'preview_restoration'->>'origin_run_id' is distinct from r->>'origin_run_id'
    or c.metadata->'preview_restoration'->>'from_path' is distinct from a->>'previous_path'
    or c.metadata->'preview_restoration'->>'from_sha256' is distinct from a->>'previous_sha256'
    or c.metadata->'preview_restoration'->>'target_path' is distinct from c.preview_storage_path
    or c.metadata->'preview_restoration'->>'target_sha256' is distinct from c.preview_sha256
    or coalesce(c.metadata->'preview_restoration'->>'manifest_sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce((r->>'width')::integer,0)<=0 or coalesce((r->>'height')::integer,0)<=0
    or (r->>'width')::bigint*(r->>'height')::bigint>40000000
    or not exists(select 1 from jsonb_array_elements(v_run.preview_selection->'approved_assets') x
      where x->>'ad_id'=a->>'ad_id' and x->>'creative_id'=c.creative_id
       and x->>'video_id'=c.metadata->>'video_id' and x->>'sha256'=c.preview_sha256)
    or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
      where b.id='dashboard-creatives' and not b.public and o.name=c.preview_storage_path)
    or not exists(select 1 from storage.objects o where o.bucket_id='dashboard-creatives' and o.name=a->>'previous_path')
    then return null; end if;
   v_restored:=v_restored+1;
  elsif r->>'outcome'='updated' then
   if c.creative_id is distinct from a->>'creative_id' or c.metadata->>'video_id' is distinct from a->>'video_id'
    or (a->>'asset_key' is not null and c.metadata->>'preview_asset_key' is distinct from a->>'asset_key')
    or c.preview_sha256 is not distinct from a->>'previous_sha256'
    or c.preview_storage_path is null or c.preview_sha256 is null
    or c.preview_sha256 !~ '^[a-f0-9]{64}$'
    or (a->>'previous_path' is not null and
      (c.metadata->'preview_previous'->>'path' is distinct from a->>'previous_path'
       or c.metadata->'preview_previous'->>'sha256' is distinct from a->>'previous_sha256'))
    or position(left(c.preview_sha256,12) in c.preview_storage_path)=0
    or c.preview_storage_path not like v_run.client_id::text||'/meta_ads/'||v_run.account_id||'/ad/'||(a->>'ad_id')||'/%'
    or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id where b.id='dashboard-creatives' and not b.public and o.name=c.preview_storage_path)
    or c.metadata->>'preview_width' is distinct from r->>'width' or c.metadata->>'preview_height' is distinct from r->>'height'
    or v_long<v_min_long
    or exists(select 1 from jsonb_array_elements(v_run.preview_selection->'approved_assets') x where x->>'ad_id'=a->>'ad_id' and x->>'sha256' is distinct from c.preview_sha256)
    then return null; end if;
   v_updated:=v_updated+1;
  elsif r->>'outcome' in ('preserved_adequate','preserved_inadequate') then
   if c.preview_sha256 is distinct from a->>'previous_sha256' or c.preview_storage_path is distinct from a->>'previous_path'
    or c.creative_id is distinct from a->>'creative_id' or c.metadata->>'video_id' is distinct from a->>'video_id'
    or (a->>'asset_key' is not null and c.metadata->>'preview_asset_key' is distinct from a->>'asset_key')
    or (r->>'outcome'='preserved_adequate' and (c.preview_storage_path is null or not exists(
      select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id
      where b.id='dashboard-creatives' and not b.public and o.name=c.preview_storage_path)))
    then return null; end if;
   v_preserved:=v_preserved+1;
  else v_failed:=v_failed+1; end if;
 end loop;
 v_result:=jsonb_build_object('status',case when v_failed>0 then 'failed' else 'success' end,
 'counts',jsonb_build_object('updated',v_updated,'restored',v_restored,'preserved',v_preserved,'failed',v_failed),'results',p_results);
 if v_run.preview_results is not null and v_run.preview_results is distinct from v_result then return null; end if;
 update public.dashboard_automation_runs set preview_results=v_result where id=p_run_id;
 return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

notify pgrst,'reload schema';
commit;
