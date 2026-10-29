-- ISOLATED ONLY. Real reservation RPCs, all rows/pg_net dispatches rolled back.
-- No forged reservation inserts and no elapsed-time/cooldown manipulation.
begin;
do $test$
declare
 actor uuid; client bigint; response jsonb; claim jsonb; selection jsonb; fingerprint text;
 run uuid; metric uuid; rejected boolean; result jsonb; today date; before_status jsonb; after_status jsonb;
begin
 select c.id,m.user_id into client,actor from public.dashboard_clients c
 join public.dashboard_client_users m on m.client_id=c.id where c.slug='rls-sandbox-b' and m.role='admin';
 assert client is not null and actor is not null, 'ISOLATED_CLIENT_GUARD';
 assert exists(select 1 from public.dashboard_clients where id=1 and name='RLS_SANDBOX_ONLY'), 'ISOLATED_NAME_GUARD';
 insert into public.dashboard_source_accounts(client_id,source,account_id,account_name,automation_enabled)
 values(client,'meta_ads','900000009999','SYNTHETIC ROLLBACK ONLY',true);
 insert into public.dashboard_creative_previews(client_id,source,account_id,entity_type,entity_id,ad_id,creative_id,creative_type,preview_kind,metadata)
 values(client,'meta_ads','900000009999','ad','899999','899999','699999','video','unavailable',
  '{"video_id":"799999","preview_asset_key":"video:799999"}');
 before_status:=public.get_dashboard_sync_status('rls-sandbox-b',actor);
 response:=public.request_dashboard_preview_sync('rls-sandbox-b',actor,gen_random_uuid(),array['899999']);
 assert response->'results'->0->>'state'='accepted', 'LEGITIMATE_RESERVATION_REQUIRED';
 run:=(response->'results'->0->>'run_id')::uuid;
 select preview_selection,selection_fingerprint,range_end into selection,fingerprint,today from public.dashboard_automation_runs where id=run;
 assert fingerprint=encode(sha256(convert_to(selection::text,'UTF8')),'hex'), 'CANONICAL_FINGERPRINT';
 assert public.start_dashboard_sync_run(run)->>'operation'='previews', 'COORDINATOR_CLAIM';
 assert public.start_dashboard_sync_run(run) is null, 'COORDINATOR_REPLAY_DENIED';
 assert not public.begin_dashboard_sync_collection(run,client,'meta_ads',today-7,today), 'PREVIEW_CANNOT_WRITE_METRICS';
 assert not public.begin_dashboard_preview_collection(run,client+1,'900000009999',today-7,today,selection,fingerprint), 'WRONG_CLIENT';
 assert not public.begin_dashboard_preview_collection(run,client,'900000000001',today-7,today,selection,fingerprint), 'WRONG_ACCOUNT';
 assert not public.begin_dashboard_preview_collection(run,client,'900000009999',today-7,today,selection||'{"ad_ids":["1"]}',fingerprint), 'CHANGED_IDS';
 assert not public.begin_dashboard_preview_collection(run,client,'900000009999',today-7,today,selection,repeat('a',64)), 'CHANGED_FINGERPRINT';
 rejected:=false;
 begin update public.dashboard_automation_runs set operation='metrics',preview_selection=null,selection_fingerprint=null where id=run;
 exception when sqlstate '22023' then rejected:=true; end;
 assert rejected, 'IMMUTABLE_PURPOSE';
 rejected:=false;
 begin update public.dashboard_automation_runs set preview_selection=selection||'{"ad_ids":["1"]}' where id=run;
 exception when sqlstate '22023' then rejected:=true; end;
 assert rejected, 'IMMUTABLE_SELECTION';
 response:=public.request_dashboard_preview_sync('rls-sandbox-b',actor,gen_random_uuid(),array['899999']);
 assert response->'results'->0->>'state'='active', 'CONCURRENT_EXCLUSION';
 assert public.begin_dashboard_preview_collection(run,client,'900000009999',today-7,today,selection,fingerprint), 'EXACT_SELECTION';
 assert not public.begin_dashboard_preview_collection(run,client,'900000009999',today-7,today,selection,fingerprint), 'COLLECTOR_REPLAY_DENIED';
 assert public.verify_dashboard_preview_results(run,'[]') is null, 'INCOMPLETE_RECEIPTS';
 assert public.verify_dashboard_preview_results(run,'[{"ad_id":"1","outcome":"updated"}]') is null, 'FOREIGN_RECEIPT';
 assert public.verify_dashboard_preview_results(run,'[{"ad_id":"899999","outcome":"preserved_adequate","path":null,"sha256":null,"mime":null}]') is null, 'NO_FALSE_HD_LABEL';
 rejected:=false;
 begin perform public.finish_dashboard_sync_run(run,'success',200,'{}',null,null);
 exception when sqlstate '22023' then rejected:=true; end;
 assert rejected, 'HTTP_200_IS_NOT_PERSISTENCE';
 begin
  result:=public.verify_dashboard_preview_results(run,'[{"ad_id":"899999","outcome":"failed_download","path":null,"sha256":null,"mime":null,"width":null,"height":null}]');
  assert result->>'status'='failed', 'FAILURE_NOT_SUCCESS';
  assert public.verify_dashboard_preview_results(run,'[{"ad_id":"899999","outcome":"cas_conflict","path":null,"sha256":null,"mime":null}]') is null, 'IMMUTABLE_RECEIPT';
  raise sqlstate 'Z0001'; -- Roll back only the deliberately failing proof, then test a legitimate pending result.
 exception when sqlstate 'Z0001' then null; end;
 result:=public.verify_dashboard_preview_results(run,'[{"ad_id":"899999","outcome":"preserved_inadequate","path":null,"sha256":null,"mime":null,"width":null,"height":null}]');
 assert result->>'status'='success', 'COMPLETE_PENDING_RESULT';
 perform public.finish_dashboard_sync_run(run,'success',200,result->'counts',null,null);
 after_status:=public.get_dashboard_sync_status('rls-sandbox-b',actor,array[run]);
 assert (select x->'last_success_at' from jsonb_array_elements(after_status->'sources') x where x->>'source'='meta_ads')
  is not distinct from (select x->'last_success_at' from jsonb_array_elements(before_status->'sources') x where x->>'source'='meta_ads'), 'PREVIEWS_DO_NOT_REFRESH_METRIC_FRESHNESS';
 assert (select x->'latest_run' from jsonb_array_elements(after_status->'sources') x where x->>'source'='meta_ads')
  is not distinct from (select x->'latest_run' from jsonb_array_elements(before_status->'sources') x where x->>'source'='meta_ads'), 'METRIC_HISTORY_PRESERVED';
 assert after_status->'requested_runs'->0->>'operation'='previews', 'EXPLICIT_RUN_PURPOSE';
 response:=public.reserve_dashboard_sync(client,'meta_ads','backfill',today-7,today-1,actor,gen_random_uuid());
 assert response->>'state'='accepted', 'BACKFILL_COMPATIBLE'; metric:=(response->>'run_id')::uuid;
 claim:=public.start_dashboard_sync_run(metric);
 assert claim->>'operation'='metrics' and claim->'preview_selection'='null'::jsonb, 'DEFAULT_METRICS';
 assert not public.begin_dashboard_preview_collection(metric,client,'900000009999',today-7,today-1,selection,fingerprint), 'METRICS_CANNOT_WRITE_PREVIEWS';
 assert public.begin_dashboard_sync_collection(metric,client,'meta_ads',today-7,today-1), 'NORMAL_COLLECTION_COMPATIBLE';
 perform public.finish_dashboard_sync_run(metric,'success',200,'{"daily":0}','no_data',null);
end $test$;
select 'All protocol assertions passed; transaction rolled back' as result;
rollback;
