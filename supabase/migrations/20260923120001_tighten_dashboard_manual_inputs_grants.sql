revoke all on table public.dashboard_manual_inputs from anon, authenticated;

grant select, insert, update
on table public.dashboard_manual_inputs
to authenticated;
