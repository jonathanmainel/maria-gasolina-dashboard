-- ISOLATED TEST SETUP ONLY. Existing versioned Storage policy, unchanged.
-- See supabase/migrations/20260924141803_fix_creative_storage_rls.sql.
begin;
do $$ begin
 if not exists(select 1 from public.dashboard_clients where id=1 and name='RLS_SANDBOX_ONLY')
 or not exists(select 1 from storage.buckets where id='dashboard-creatives' and not public)
 then raise exception 'ISOLATED_PRIVATE_BUCKET_GUARD'; end if;
end $$;
create policy dashboard_creatives_member_select on storage.objects for select to authenticated
using (bucket_id='dashboard-creatives' and (storage.foldername(name))[1] ~ '^[0-9]+$'
 and (select private.is_dashboard_client_member(((storage.foldername(name))[1])::bigint)));
commit;
