-- ISOLATED ONLY: existing Supabase homologation with RLS_SANDBOX_ONLY markers.
-- Every fixture, reservation, pg_net queue entry and temporary role change is rolled back.
-- pg_net sends HTTP only after commit; this script never commits its queued test requests.
DO $test$
DECLARE
 editor_id uuid; admin_id uuid; viewer_id uuid; foreign_id uuid; actor uuid;
 client bigint:=2; today date:=(now() at time zone 'America/Sao_Paulo')::date;
 response jsonb; claim jsonb; run_id uuid; key uuid; selection jsonb; fingerprint text;
 blocked boolean; before_runs jsonb; after_runs jsonb; labels jsonb:='[]'; result jsonb;
BEGIN
 PERFORM set_config('plpgsql.check_asserts','on',true);
 IF NOT EXISTS(SELECT 1 FROM public.dashboard_clients WHERE id=1 AND name='RLS_SANDBOX_ONLY')
 OR NOT EXISTS(SELECT 1 FROM public.dashboard_clients WHERE id=2 AND name='RLS_SANDBOX_ONLY' AND slug='rls-sandbox-b')
 THEN RAISE EXCEPTION 'ISOLATED_SANDBOX_REQUIRED'; END IF;
 SELECT user_id INTO editor_id FROM public.dashboard_client_users WHERE client_id=2 AND role='editor' ORDER BY user_id LIMIT 1;
 SELECT user_id INTO admin_id FROM public.dashboard_client_users WHERE client_id=2 AND role='admin' ORDER BY user_id LIMIT 1;
 SELECT user_id INTO viewer_id FROM public.dashboard_client_users WHERE client_id=1 AND role='viewer' ORDER BY user_id LIMIT 1;
 SELECT user_id INTO foreign_id FROM public.dashboard_client_users m WHERE client_id=1 AND role='admin'
 AND NOT EXISTS(SELECT 1 FROM public.dashboard_client_users x WHERE x.client_id=2 AND x.user_id=m.user_id) LIMIT 1;
 ASSERT editor_id IS NOT NULL AND admin_id IS NOT NULL AND viewer_id IS NOT NULL AND foreign_id IS NOT NULL,'EXISTING_SANDBOX_IDENTITIES';
 ASSERT NOT EXISTS(SELECT 1 FROM public.dashboard_source_accounts WHERE client_id=2),'EMPTY_TEST_SOURCE_SCOPE';
 ASSERT NOT EXISTS(SELECT 1 FROM public.dashboard_automation_runs WHERE client_id=2 AND status IN ('queued','running','indeterminate')),'NO_ACTIVE_TEST_SCOPE';
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO before_runs FROM public.dashboard_automation_runs r;
 BEGIN
  INSERT INTO public.dashboard_client_users(client_id,user_id,role) VALUES(2,viewer_id,'viewer') ON CONFLICT DO NOTHING;
  INSERT INTO public.dashboard_source_accounts(id,client_id,source,account_id,account_name,automation_enabled)
  OVERRIDING SYSTEM VALUE VALUES
  (-2026110301,2,'google_ads','900000009901','SYNTHETIC ROLLBACK ONLY',true),
  (-2026110302,2,'meta_ads','900000009902','SYNTHETIC ROLLBACK ONLY',true),
  (-2026110303,2,'ga4','900000009903','SYNTHETIC ROLLBACK ONLY',true);
  INSERT INTO public.dashboard_creative_previews(id,client_id,source,account_id,entity_type,entity_id,ad_id,creative_id,creative_type,preview_kind,metadata)
  OVERRIDING SYSTEM VALUE VALUES
  (-2026110301,2,'meta_ads','900000009902','ad','899999','899999','699999','video','unavailable',
   '{"video_id":"799999","preview_asset_key":"video:799999"}');
  EXECUTE 'SET LOCAL ROLE service_role';
  ASSERT (public.get_dashboard_sync_status('rls-sandbox-b',editor_id)->>'can_request')::boolean,'EDITOR_CAPABILITY';
  ASSERT (public.get_dashboard_sync_status('rls-sandbox-b',admin_id)->>'can_request')::boolean,'ADMIN_CAPABILITY';
  ASSERT NOT (public.get_dashboard_sync_status('rls-sandbox-b',viewer_id)->>'can_request')::boolean,'VIEWER_CAPABILITY_FALSE';
  ASSERT NOT has_function_privilege('authenticated','public.request_dashboard_sync(text,uuid,text[],uuid)','EXECUTE'),'NO_DIRECT_AUTHENTICATED_RPC';
  ASSERT NOT has_function_privilege('anon','public.request_dashboard_preview_sync(text,uuid,uuid,text[],jsonb)','EXECUTE'),'NO_ANON_RPC';
  labels:=labels||'["role_capabilities","service_role_only_rpc_grants"]';
  FOREACH actor IN ARRAY ARRAY[viewer_id,foreign_id] LOOP
   blocked:=false;
   BEGIN PERFORM public.request_dashboard_sync('rls-sandbox-b',actor,ARRAY['google_ads'],gen_random_uuid());
   EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
   ASSERT blocked,'VIEWER_OR_FOREIGN_METRICS_DENIED';
   blocked:=false;
   BEGIN PERFORM public.request_dashboard_preview_sync('rls-sandbox-b',actor,gen_random_uuid(),ARRAY['899999']);
   EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
   ASSERT blocked,'VIEWER_OR_FOREIGN_PREVIEW_DENIED';
   blocked:=false;
   BEGIN PERFORM public.reserve_dashboard_sync(2,'google_ads','manual',today-7,today,actor,gen_random_uuid());
   EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
   ASSERT blocked,'VIEWER_OR_FOREIGN_RESERVATION_DENIED';
  END LOOP;
  labels:=labels||'["viewer_request_reservation_denied","foreign_client_request_reservation_denied"]';
  FOREACH actor IN ARRAY ARRAY[editor_id,admin_id] LOOP
   BEGIN
    key:=gen_random_uuid();
    response:=public.request_dashboard_sync('rls-sandbox-b',actor,ARRAY['google_ads'],key);
    ASSERT response->'results'->0->>'state'='accepted','METRICS_REQUEST_ACCEPTED';
    run_id:=(response->'results'->0->>'run_id')::uuid;
    ASSERT public.request_dashboard_sync('rls-sandbox-b',actor,ARRAY['google_ads'],key)->'results'->0->>'state'='existing','IDEMPOTENT_REQUEST';
    ASSERT public.request_dashboard_sync('rls-sandbox-b',actor,ARRAY['google_ads'],gen_random_uuid())->'results'->0->>'state'='active','ACTIVE_RUN_EXCLUSION';
    claim:=public.start_dashboard_sync_run(run_id);
    ASSERT claim->>'id'=run_id::text AND claim->>'operation'='metrics','METRICS_WORKER_ACCEPTED';
    ASSERT public.start_dashboard_sync_run(run_id) IS NULL,'WORKER_REPLAY_DENIED';
    ASSERT public.begin_dashboard_sync_collection(run_id,2,'google_ads',today-7,today),'METRICS_COLLECTOR_ACCEPTED';
    ASSERT NOT public.begin_dashboard_sync_collection(run_id,2,'google_ads',today-7,today),'COLLECTOR_REPLAY_DENIED';
    PERFORM public.finish_dashboard_sync_run(run_id,'success',200,'{}','no_data',NULL);
    ASSERT public.request_dashboard_sync('rls-sandbox-b',actor,ARRAY['google_ads'],gen_random_uuid())->'results'->0->>'state'='cooldown','MANUAL_COOLDOWN_PRESERVED';
    labels:=labels||jsonb_build_array(jsonb_build_object('metrics_cycle_role',CASE WHEN actor=editor_id THEN 'editor' ELSE 'admin' END,'request_worker_collector',true,'idempotency_exclusion_cooldown',true));
    RAISE EXCEPTION USING ERRCODE='ZT002',MESSAGE='Rollback this metrics cycle';
   EXCEPTION WHEN SQLSTATE 'ZT002' THEN NULL; END;
   BEGIN
    response:=public.request_dashboard_preview_sync('rls-sandbox-b',actor,gen_random_uuid(),ARRAY['899999']);
    ASSERT response->'results'->0->>'state'='accepted','PREVIEW_REQUEST_ACCEPTED';
    run_id:=(response->'results'->0->>'run_id')::uuid;
    SELECT preview_selection,selection_fingerprint INTO selection,fingerprint FROM public.dashboard_automation_runs WHERE id=run_id;
    ASSERT public.start_dashboard_sync_run(run_id)->>'operation'='previews','PREVIEW_WORKER_ACCEPTED';
    IF actor=editor_id THEN
     BEGIN
      EXECUTE 'RESET ROLE';
      UPDATE public.dashboard_client_users SET role='viewer' WHERE client_id=2 AND user_id=actor;
      EXECUTE 'SET LOCAL ROLE service_role';
      ASSERT NOT public.begin_dashboard_preview_collection(run_id,2,'900000009902',today-7,today,selection,fingerprint),'REVOKED_EDITOR_PREVIEW_COLLECTOR_DENIED';
      RAISE EXCEPTION USING ERRCODE='ZT003',MESSAGE='Restore editor after revocation proof';
     EXCEPTION WHEN SQLSTATE 'ZT003' THEN NULL; END;
    END IF;
    ASSERT NOT public.begin_dashboard_preview_collection(run_id,1,'900000009902',today-7,today,selection,fingerprint),'PREVIEW_WRONG_CLIENT_DENIED';
    ASSERT NOT public.begin_dashboard_preview_collection(run_id,2,'900000009902',today-7,today,selection,repeat('a',64)),'PREVIEW_FINGERPRINT_PRESERVED';
    ASSERT public.begin_dashboard_preview_collection(run_id,2,'900000009902',today-7,today,selection,fingerprint),'PREVIEW_COLLECTOR_ACCEPTED';
    ASSERT NOT public.begin_dashboard_preview_collection(run_id,2,'900000009902',today-7,today,selection,fingerprint),'PREVIEW_REPLAY_DENIED';
    labels:=labels||jsonb_build_array(jsonb_build_object('preview_cycle_role',CASE WHEN actor=editor_id THEN 'editor' ELSE 'admin' END,'request_worker_collector',true,'selection_replay_protected',true));
    RAISE EXCEPTION USING ERRCODE='ZT002',MESSAGE='Rollback this preview cycle';
   EXCEPTION WHEN SQLSTATE 'ZT002' THEN NULL; END;
  END LOOP;
  -- The editor may initiate manual syncs but cannot initiate historical backfill.
  blocked:=false;
  BEGIN PERFORM public.reserve_dashboard_sync(2,'google_ads','backfill',today-7,today-1,editor_id,gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
  ASSERT blocked,'EDITOR_BACKFILL_DENIED';
  -- Recheck role at worker start, both after revocation and for admin-only backfill.
  BEGIN
   response:=public.reserve_dashboard_sync(2,'google_ads','manual',today-7,today,editor_id,gen_random_uuid());
   run_id:=(response->>'run_id')::uuid;
   EXECUTE 'RESET ROLE';
   UPDATE public.dashboard_client_users SET role='viewer' WHERE client_id=2 AND user_id=editor_id;
   EXECUTE 'SET LOCAL ROLE service_role';
   ASSERT public.start_dashboard_sync_run(run_id) IS NULL,'REVOKED_EDITOR_WORKER_DENIED';
   ASSERT (SELECT error_code='AUTHORIZATION_CHANGED' FROM public.dashboard_automation_runs WHERE id=run_id),'REVOKED_RUN_CANCELLED';
   RAISE EXCEPTION USING ERRCODE='ZT002',MESSAGE='Restore temporary revocation';
  EXCEPTION WHEN SQLSTATE 'ZT002' THEN NULL; END;
  BEGIN
   response:=public.reserve_dashboard_sync(2,'google_ads','backfill',today-7,today-1,admin_id,gen_random_uuid());
   run_id:=(response->>'run_id')::uuid;
   EXECUTE 'RESET ROLE';
   UPDATE public.dashboard_client_users SET role='editor' WHERE client_id=2 AND user_id=admin_id;
   EXECUTE 'SET LOCAL ROLE service_role';
   ASSERT public.start_dashboard_sync_run(run_id) IS NULL,'BACKFILL_STILL_REQUIRES_ADMIN_AT_START';
   RAISE EXCEPTION USING ERRCODE='ZT002',MESSAGE='Restore temporary admin downgrade';
  EXCEPTION WHEN SQLSTATE 'ZT002' THEN NULL; END;
  BEGIN
   response:=public.reserve_dashboard_sync(2,'google_ads','backfill',today-7,today-1,admin_id,gen_random_uuid());
   run_id:=(response->>'run_id')::uuid;
   ASSERT public.start_dashboard_sync_run(run_id)->>'id'=run_id::text,'ADMIN_BACKFILL_PRESERVED';
   RAISE EXCEPTION USING ERRCODE='ZT002',MESSAGE='Rollback admin backfill proof';
  EXCEPTION WHEN SQLSTATE 'ZT002' THEN NULL; END;
  BEGIN
   response:=public.reserve_dashboard_sync(2,'google_ads','cron',today-7,today-1,NULL,NULL);
   run_id:=(response->>'run_id')::uuid;
   ASSERT public.start_dashboard_sync_run(run_id)->>'id'=run_id::text,'CRON_PRESERVED';
   RAISE EXCEPTION USING ERRCODE='ZT002',MESSAGE='Rollback cron proof';
  EXCEPTION WHEN SQLSTATE 'ZT002' THEN NULL; END;
  labels:=labels||'["editor_backfill_denied","role_rechecked_at_worker_and_preview_collector","admin_backfill_preserved","cron_preserved"]';
  RAISE EXCEPTION USING ERRCODE='ZT001',MESSAGE='Rollback all fixtures and queued HTTP requests';
 EXCEPTION WHEN SQLSTATE 'ZT001' THEN NULL; END;
 SELECT jsonb_agg(to_jsonb(r) ORDER BY id) INTO after_runs FROM public.dashboard_automation_runs r;
 ASSERT before_runs IS NOT DISTINCT FROM after_runs,'ALL_RESERVATIONS_ROLLED_BACK';
 ASSERT NOT EXISTS(SELECT 1 FROM public.dashboard_source_accounts WHERE client_id=2),'ALL_SOURCE_FIXTURES_ROLLED_BACK';
 ASSERT NOT EXISTS(SELECT 1 FROM public.dashboard_creative_previews WHERE id=-2026110301),'ALL_PREVIEW_FIXTURES_ROLLED_BACK';
 result:=jsonb_build_object('passed',true,'checks',labels,'all_test_writes_rolled_back',true,'no_provider_requests_committed',true,'scope','Existing isolated Supabase PostgreSQL; role-bound RPCs and worker/collector checks, no platform collection');
 PERFORM set_config('task.editor_sync_test',result::text,true);
END $test$;
SELECT current_setting('task.editor_sync_test')::jsonb AS result;

