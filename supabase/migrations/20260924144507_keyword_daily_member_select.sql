-- Match the membership-scoped read policy used by other dashboard detail tables.
-- Remove the broad table grants that predated this policy; ingestion uses service_role.

alter table public.dashboard_keyword_daily enable row level security;

revoke all on table public.dashboard_keyword_daily from public, anon, authenticated;
grant select on table public.dashboard_keyword_daily to authenticated;

drop policy if exists dashboard_keyword_daily_member_select
  on public.dashboard_keyword_daily;

create policy dashboard_keyword_daily_member_select
on public.dashboard_keyword_daily
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));
