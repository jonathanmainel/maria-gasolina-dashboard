-- TEST SUPPORT ONLY. Never apply on production; extends the existing isolated reconciler.
-- No active native collector may be released, and preview proof is verified separately.
begin;
do $$ begin
 if not exists(select 1 from public.dashboard_clients where id=1 and name='RLS_SANDBOX_ONLY')
 or to_regclass('public.manual_sync_homolog_receipts') is null then raise exception 'ISOLATED_ONLY'; end if;
end $$;
create or replace function public.reconcile_manual_sync_homolog(p_run_id uuid,p_operator uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed uuid;
begin
 update public.dashboard_automation_runs r set
 status=case when r.operation='previews' then r.preview_results->>'status'
  when a.outcome='success' and a.write_status in ('success','already_processed','no_data') then 'success' else 'failed' end,
 http_status=a.http_status,database_write_status=case when r.operation='previews' then null else a.write_status end,
 counts=case when r.operation='previews' then r.preview_results->'counts'
  else a.counts||jsonb_build_object('homolog_reconciled_by',p_operator,'homolog_terminal_receipt',true) end,
 completed_at=a.finished_at,
 error_code=case when r.operation='previews' then case when r.preview_results->>'status'='success' then null else 'PREVIEW_BATCH_FAILED' end
  when a.outcome='success' and a.write_status in ('success','already_processed','no_data') then null else 'HOMOLOG_RECONCILED_FAILURE' end,
 error_message=null
 from public.manual_sync_homolog_receipts a
 where r.id=p_run_id and a.run_id=r.id and r.status='indeterminate' and a.finished_at is not null
 and (r.operation='metrics' or (r.preview_results is not null
  and r.preview_results->'results'=a.counts->'preview_results' and r.preview_results->>'status' in ('success','failed')))
 and exists(select 1 from public.dashboard_clients c where c.id=r.client_id and c.name='RLS_SANDBOX_ONLY')
 and exists(select 1 from public.dashboard_client_users u where u.client_id=r.client_id and u.user_id=p_operator and u.role='admin')
 returning r.id into changed;
 return changed is not null;
end $$;
-- Existing function privileges stay backend-only; do not add a public entry point.
revoke all on function public.reconcile_manual_sync_homolog(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_manual_sync_homolog(uuid,uuid) to service_role;
commit;
