-- Authorized rollback only. Preserve all other jobs and all financial records.
begin;
do $$ declare j bigint; begin
  select jobid into j from cron.job where jobname='retaguarda-meta-balance-hourly'
    and command='select private.dispatch_retaguarda_meta_balance();';
  if j is null then raise exception 'SCHEDULER_NOT_VERIFIED'; end if;
  perform cron.alter_job(j,active:=false);
end $$;
commit;
