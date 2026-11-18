-- PRODUCTION WRITE: execute only after explicit scheduling authorization.
-- No key, URL or account is accepted from command-line parameters.
begin;
do $$ declare j bigint; begin
  if (select count(*) from cron.job where jobname='retaguarda-meta-balance-hourly' and schedule='7 * * * *'
    and command='select private.dispatch_retaguarda_meta_balance();')<>1 then raise exception 'SCHEDULER_NOT_VERIFIED'; end if;
  if not exists(select 1 from vault.decrypted_secrets where name='dashboard_project_url'
    and decrypted_secret='https://hlqrpreqvvxtkruwsolg.supabase.co') then raise exception 'WRONG_PROJECT'; end if;
  if not exists(select 1 from vault.secrets where name='dashboard_cron_secret_key') then raise exception 'SERVER_AUTH_NOT_CONFIGURED'; end if;
  if not exists(select 1 from public.dashboard_retaguarda_financial_entries where client_id=1 and platform='meta_ads'
    and account_id='1063721474298569' and origin='api' and available_balance_brl is not null
    and measured_at>now()-interval '24 hours') then raise exception 'FIRST_REAL_MEASUREMENT_NOT_VERIFIED'; end if;
  select jobid into j from cron.job where jobname='retaguarda-meta-balance-hourly';
  perform cron.alter_job(j,active:=true);
end $$;
commit;
