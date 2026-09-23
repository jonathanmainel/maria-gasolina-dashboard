-- Keep the dashboard membership helper outside the exposed API schema.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_dashboard_client_member(p_client_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dashboard_client_users dcu
    where dcu.client_id = p_client_id
      and dcu.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_dashboard_client_member(bigint)
  from public, anon, authenticated;
grant execute on function private.is_dashboard_client_member(bigint)
  to authenticated;

alter policy dashboard_clients_member_select
on public.dashboard_clients
using ((select private.is_dashboard_client_member(id)));

alter policy dashboard_daily_metrics_member_select
on public.dashboard_daily_metrics
using ((select private.is_dashboard_client_member(client_id)));

alter policy dashboard_campaign_daily_member_select
on public.dashboard_campaign_daily
using ((select private.is_dashboard_client_member(client_id)));

alter policy dashboard_crm_funnel_daily_member_select
on public.dashboard_crm_funnel_daily
using ((select private.is_dashboard_client_member(client_id)));

alter policy dashboard_sync_runs_member_select
on public.dashboard_sync_runs
using ((select private.is_dashboard_client_member(client_id)));

revoke all on function public.is_dashboard_client_member(bigint)
  from public, anon, authenticated, service_role;
drop function public.is_dashboard_client_member(bigint);

;
