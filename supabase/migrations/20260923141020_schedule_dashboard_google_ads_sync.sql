create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'google-ads-daily-sync') then
    perform cron.unschedule('google-ads-daily-sync');
  end if;
end;
$$;

select cron.schedule(
  'google-ads-daily-sync',
  -- The project cron timezone is GMT: 04:00 UTC is 01:00 in Sao Paulo.
  '0 4 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'dashboard_project_url'
      ) || '/functions/v1/sync-dashboard-daily',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'dashboard_cron_secret_key'
        ),
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'dashboard_cron_secret_key'
        )
      ),
      body := '{"trigger":"cron"}'::jsonb
    );
  $job$
);
