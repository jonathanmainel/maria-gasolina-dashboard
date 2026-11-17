create table public.dashboard_retaguarda_financial_entries (
  id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.dashboard_clients(id),
  platform text not null check (platform in ('meta_ads', 'google_ads')),
  account_id text not null,
  reference_date date not null check (isfinite(reference_date)),
  measured_at timestamptz default statement_timestamp() check (isfinite(measured_at)),
  available_balance_brl numeric check (
    available_balance_brl between 0 and 999999999999.99
    and available_balance_brl = trunc(available_balance_brl, 2)
  ),
  estimated_daily_spend_brl numeric check (
    estimated_daily_spend_brl between 0 and 999999999999.99
    and estimated_daily_spend_brl = trunc(estimated_daily_spend_brl, 2)
  ),
  origin text not null default 'manual' check (origin in ('manual', 'import', 'api')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default statement_timestamp(),
  previous_id uuid,
  request_key uuid not null default gen_random_uuid(),
  source_key text,
  constraint retaguarda_finance_account foreign key (client_id, platform, account_id)
    references public.dashboard_source_accounts (client_id, source, account_id),
  constraint retaguarda_finance_scope unique (client_id, platform, account_id, reference_date, id),
  constraint retaguarda_finance_previous foreign key (client_id, platform, account_id, reference_date, previous_id)
    references public.dashboard_retaguarda_financial_entries (client_id, platform, account_id, reference_date, id),
  constraint retaguarda_finance_no_self_reference check (id <> previous_id),
  constraint retaguarda_finance_single_successor unique (previous_id),
  constraint retaguarda_finance_request_key unique (client_id, request_key),
  constraint retaguarda_finance_origin_data check (
    (origin = 'manual' and source_key is null and created_by is not null and measured_at is not null
      and available_balance_brl is not null and estimated_daily_spend_brl is not null)
    or (origin in ('import', 'api') and length(btrim(source_key)) > 0 and source_key is not null
      and (available_balance_brl is not null or estimated_daily_spend_brl is not null))
  )
);

create unique index retaguarda_finance_one_root
  on public.dashboard_retaguarda_financial_entries (client_id, platform, account_id, reference_date)
  where previous_id is null;
create unique index retaguarda_finance_source_key
  on public.dashboard_retaguarda_financial_entries (client_id, platform, account_id, origin, source_key)
  where source_key is not null;
create index retaguarda_finance_history
  on public.dashboard_retaguarda_financial_entries (client_id, reference_date desc, id);

-- Prevent history changes even for the trusted ingestion role. The table owner
-- can still perform schema administration outside the application contract.
create function private.reject_retaguarda_financial_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  raise exception 'Registros financeiros são imutáveis. Insira uma nova versão.' using errcode = '55000';
end;
$$;
revoke all on function private.reject_retaguarda_financial_change() from public, anon, authenticated, service_role;
create trigger retaguarda_financial_immutable
  before update or delete or truncate on public.dashboard_retaguarda_financial_entries
  for each statement execute function private.reject_retaguarda_financial_change();

-- The source account table is private to the ingestion system. This narrow
-- projection exposes only paid accounts of a client the caller belongs to.
create function private.retaguarda_financial_accounts(p_client_id bigint)
returns table(platform text, account_id text, account_name text, active boolean)
language sql stable security definer set search_path = ''
as $$
  select a.source, a.account_id, a.account_name, a.active
  from public.dashboard_source_accounts a
  where a.client_id = p_client_id and a.source in ('meta_ads', 'google_ads')
    and (select private.is_dashboard_client_member(p_client_id));
$$;
revoke all on function private.retaguarda_financial_accounts(bigint) from public, anon, authenticated, service_role;
grant execute on function private.retaguarda_financial_accounts(bigint) to authenticated;

create function public.get_retaguarda_financial_accounts(p_client_id bigint)
returns table(platform text, account_id text, account_name text, active boolean)
language sql stable security invoker set search_path = ''
as $$
  select * from private.retaguarda_financial_accounts(p_client_id)
  order by platform, account_name, account_id;
$$;
revoke all on function public.get_retaguarda_financial_accounts(bigint) from public, anon, authenticated, service_role;
grant execute on function public.get_retaguarda_financial_accounts(bigint) to authenticated;

alter table public.dashboard_retaguarda_financial_entries enable row level security;
revoke all on public.dashboard_retaguarda_financial_entries from public, anon, authenticated, service_role;
grant select on public.dashboard_retaguarda_financial_entries to authenticated, service_role;
grant insert (client_id, platform, account_id, reference_date, available_balance_brl,
  estimated_daily_spend_brl, previous_id, request_key)
  on public.dashboard_retaguarda_financial_entries to authenticated;
grant insert (client_id, platform, account_id, reference_date, measured_at, available_balance_brl,
  estimated_daily_spend_brl, origin, created_by, previous_id, request_key, source_key)
  on public.dashboard_retaguarda_financial_entries to service_role;

create policy retaguarda_financial_member_read on public.dashboard_retaguarda_financial_entries
  for select to authenticated
  using ((select private.is_dashboard_client_member(client_id)));

create policy retaguarda_financial_editor_append on public.dashboard_retaguarda_financial_entries
  for insert to authenticated
  with check (
    origin = 'manual' and created_by = (select auth.uid())
    and reference_date <= (statement_timestamp() at time zone 'America/Sao_Paulo')::date
    and exists (
      select 1 from public.dashboard_client_users m
      where m.client_id = dashboard_retaguarda_financial_entries.client_id
        and m.user_id = (select auth.uid()) and m.role in ('editor', 'admin')
    )
    and (
      previous_id is not null or exists (
        select 1 from private.retaguarda_financial_accounts(client_id) a
        where a.platform = dashboard_retaguarda_financial_entries.platform
          and a.account_id = dashboard_retaguarda_financial_entries.account_id and a.active
      )
    )
  );
