-- Local proposal only. No cron, credentials or campaign collectors are changed.
-- Existing financial rows/grants/immutability remain unchanged.
create table private.retaguarda_balance_runs (
  id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.dashboard_clients(id),
  platform text not null default 'meta_ads' check (platform = 'meta_ads'),
  account_id text not null,
  request_key uuid not null,
  trigger text not null check (trigger in ('manual','scheduled')),
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default clock_timestamp(),
  reference_date date not null default (statement_timestamp() at time zone 'America/Sao_Paulo')::date,
  completed_at timestamptz,
  status text not null check (status in ('running','success','failed','conflict','indeterminate')),
  previous_id uuid references public.dashboard_retaguarda_financial_entries(id),
  entry_id uuid references public.dashboard_retaguarda_financial_entries(id),
  error_code text check (error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  foreign key (client_id,platform,account_id) references public.dashboard_source_accounts(client_id,source,account_id),
  unique(client_id,account_id,request_key),
  check ((trigger='manual' and requested_by is not null) or (trigger='scheduled' and requested_by is null))
);
create unique index retaguarda_balance_active on private.retaguarda_balance_runs(client_id,account_id)
  where status in ('running','indeterminate');
create index retaguarda_balance_latest on private.retaguarda_balance_runs(client_id,account_id,requested_at desc,id);
alter table private.retaguarda_balance_runs enable row level security;
revoke all on private.retaguarda_balance_runs from public,anon,authenticated,service_role;

-- All privileged RPCs below are service-only. The manual Edge Function obtains
-- p_user_id from Auth.getUser, never from browser JSON. Membership is rechecked.
create function public.reserve_retaguarda_meta_balance(
  p_client_slug text,p_account_id text,p_request_key uuid,p_trigger text,p_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_client bigint; v_run private.retaguarda_balance_runs%rowtype;
  v_head public.dashboard_retaguarda_financial_entries%rowtype;
  v_today date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  v_next timestamptz;
begin
  if p_request_key is null or p_trigger is null or p_trigger not in ('manual','scheduled')
    or p_account_id is null or p_account_id !~ '^[0-9]{1,30}$'
    or (p_trigger='manual' and p_user_id is null) or (p_trigger='scheduled' and p_user_id is not null)
    then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  select id into v_client from public.dashboard_clients where slug=p_client_slug and active;
  if v_client is null or not exists(select 1 from public.dashboard_source_accounts
    where client_id=v_client and source='meta_ads' and account_id=p_account_id and active)
    or (p_trigger='manual' and not exists(select 1 from public.dashboard_client_users
      where client_id=v_client and user_id=p_user_id and role in ('admin','editor')))
    then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meta-balance:'||v_client||':'||p_account_id,0));
  select * into v_run from private.retaguarda_balance_runs
    where client_id=v_client and account_id=p_account_id and request_key=p_request_key;
  if found then
    if v_run.trigger<>p_trigger or v_run.requested_by is distinct from p_user_id
      then raise exception 'REQUEST_KEY_CONFLICT' using errcode='22023'; end if;
    return jsonb_build_object('state',v_run.status,'run_id',v_run.id,'entry_id',v_run.entry_id,'error_code',v_run.error_code,'replayed',true);
  end if;
  -- Never automatically retry a potentially committed write or unlock an unknown run.
  update private.retaguarda_balance_runs set status='indeterminate',error_code='BALANCE_VERIFICATION_REQUIRED'
    where client_id=v_client and account_id=p_account_id and status='running' and requested_at<clock_timestamp()-interval '2 minutes';
  select * into v_run from private.retaguarda_balance_runs where client_id=v_client and account_id=p_account_id
    and status in ('running','indeterminate');
  if found then return jsonb_build_object('state',v_run.status,'run_id',v_run.id); end if;
  select max(requested_at)+interval '5 minutes' into v_next from private.retaguarda_balance_runs where client_id=v_client and account_id=p_account_id;
  if v_next>clock_timestamp() then return jsonb_build_object('state','cooldown','retry_at',v_next); end if;
  if p_trigger='scheduled' then
    select date_trunc('hour',max(requested_at),'UTC')+interval '1 hour' into v_next from private.retaguarda_balance_runs
      where client_id=v_client and account_id=p_account_id and trigger='scheduled';
    if v_next>clock_timestamp() then return jsonb_build_object('state','cooldown','retry_at',v_next); end if;
  end if;
  select e.* into v_head from public.dashboard_retaguarda_financial_entries e
    where e.client_id=v_client and e.platform='meta_ads' and e.account_id=p_account_id and e.reference_date=v_today
      and not exists(select 1 from public.dashboard_retaguarda_financial_entries n where n.previous_id=e.id);
  insert into private.retaguarda_balance_runs(client_id,account_id,request_key,trigger,requested_by,previous_id,status,error_code,completed_at)
    values(v_client,p_account_id,p_request_key,p_trigger,p_user_id,v_head.id,
      case when v_head.origin in ('manual','import') then 'conflict' else 'running' end,
      case when v_head.origin in ('manual','import') then 'MANUAL_BALANCE_PRESERVED' end,
      case when v_head.origin in ('manual','import') then clock_timestamp() end) returning * into v_run;
  return jsonb_build_object('state',case when v_run.status='running' then 'accepted' else v_run.status end,
    'run_id',v_run.id,'error_code',v_run.error_code);
end;
$$;

create function public.finish_retaguarda_meta_balance(p_run_id uuid,p_amount numeric,p_measured_at timestamptz,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run private.retaguarda_balance_runs%rowtype; v_head public.dashboard_retaguarda_financial_entries%rowtype;
  v_entry uuid; v_code text; v_state text;
begin
  select * into v_run from private.retaguarda_balance_runs where id=p_run_id;
  if not found then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meta-balance:'||v_run.client_id||':'||v_run.account_id,0));
  select * into v_run from private.retaguarda_balance_runs where id=p_run_id for update;
  if v_run.status<>'running' then
    return jsonb_build_object('state',v_run.status,'run_id',v_run.id,'entry_id',v_run.entry_id,'error_code',v_run.error_code,'replayed',true);
  end if;
  if v_run.requested_at<clock_timestamp()-interval '2 minutes' then
    update private.retaguarda_balance_runs set status='indeterminate',error_code='BALANCE_VERIFICATION_REQUIRED' where id=p_run_id;
    return jsonb_build_object('state','indeterminate','run_id',p_run_id);
  end if;
  if p_error_code is not null then
    if p_amount is not null or p_measured_at is not null or p_error_code not in (
      'META_INVALID_RESPONSE','META_ACCOUNT_MISMATCH','META_CURRENCY_UNSUPPORTED','META_NOT_PREPAID','META_FUNDING_UNSUPPORTED',
      'META_BALANCE_FORMAT_UNSUPPORTED','META_BALANCE_OUT_OF_RANGE','BALANCE_CONFIGURATION_ERROR','META_NETWORK_OR_TIMEOUT',
      'META_PERMISSION_OR_AUTH','META_RATE_LIMIT','META_API_FAILED') then raise exception 'INVALID_ERROR' using errcode='22023'; end if;
    update private.retaguarda_balance_runs set status='failed',error_code=p_error_code,completed_at=clock_timestamp() where id=p_run_id;
    return jsonb_build_object('state','failed','run_id',p_run_id,'error_code',p_error_code);
  end if;
  if p_amount is null or not (p_amount between 0 and 999999999999.99) or p_amount<>trunc(p_amount,2)
    or p_measured_at is null or not isfinite(p_measured_at) or p_measured_at<v_run.requested_at
    or p_measured_at>clock_timestamp()+interval '30 seconds'
    or (p_measured_at at time zone 'America/Sao_Paulo')::date<>v_run.reference_date
    then raise exception 'INVALID_MEASUREMENT' using errcode='22023'; end if;
  if not exists(select 1 from public.dashboard_source_accounts a join public.dashboard_clients c on c.id=a.client_id
    where a.client_id=v_run.client_id and a.source='meta_ads' and a.account_id=v_run.account_id and a.active and c.active)
    or (v_run.trigger='manual' and not exists(select 1 from public.dashboard_client_users
      where client_id=v_run.client_id and user_id=v_run.requested_by and role in ('admin','editor')))
    then v_code:='BALANCE_AUTHORIZATION_CHANGED'; end if;
  select e.* into v_head from public.dashboard_retaguarda_financial_entries e
    where e.client_id=v_run.client_id and e.platform='meta_ads' and e.account_id=v_run.account_id and e.reference_date=v_run.reference_date
    and not exists(select 1 from public.dashboard_retaguarda_financial_entries n where n.previous_id=e.id);
  if v_head.id is distinct from v_run.previous_id or v_head.origin in ('manual','import') then v_code:='BALANCE_HISTORY_CHANGED'; end if;
  if v_code is null then
    begin
      insert into public.dashboard_retaguarda_financial_entries(client_id,platform,account_id,reference_date,measured_at,
        available_balance_brl,estimated_daily_spend_brl,origin,created_by,previous_id,request_key,source_key)
        values(v_run.client_id,'meta_ads',v_run.account_id,v_run.reference_date,p_measured_at,p_amount,null,'api',v_run.requested_by,
          v_run.previous_id,v_run.request_key,'meta-stored-balance-pt-br-v3:'||v_run.id) returning id into v_entry;
    exception when unique_violation then v_code:='BALANCE_HISTORY_CHANGED'; end;
  end if;
  v_state:=case when v_code is null then 'success' else 'conflict' end;
  update private.retaguarda_balance_runs set status=v_state,error_code=v_code,entry_id=v_entry,completed_at=clock_timestamp() where id=p_run_id;
  return jsonb_build_object('state',v_state,'run_id',p_run_id,'entry_id',v_entry,'error_code',v_code);
end;
$$;

-- Only the client member's own account status is projected, with no provider
-- payloads or credentials. This does not grant access to the private run log.
create function public.get_retaguarda_meta_balance_status(p_client_id bigint)
returns table(account_id text,status text,requested_at timestamptz,completed_at timestamptz,error_code text,entry_id uuid,overdue boolean)
language sql stable security definer set search_path='' as $$
  select a.account_id,r.status,r.requested_at,r.completed_at,r.error_code,r.entry_id,
    coalesce(r.status='running' and r.requested_at<now()-interval '2 minutes',false)
  from public.dashboard_source_accounts a
  left join lateral(select b.* from private.retaguarda_balance_runs b
    where b.client_id=a.client_id and b.account_id=a.account_id order by b.requested_at desc,b.id desc limit 1) r on true
  where a.client_id=p_client_id and a.source='meta_ads' and a.active
    and (select private.is_dashboard_client_member(p_client_id));
$$;
revoke all on function public.reserve_retaguarda_meta_balance(text,text,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.finish_retaguarda_meta_balance(uuid,numeric,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.get_retaguarda_meta_balance_status(bigint) from public,anon,authenticated,service_role;
grant execute on function public.reserve_retaguarda_meta_balance(text,text,uuid,text,uuid) to service_role;
grant execute on function public.finish_retaguarda_meta_balance(uuid,numeric,timestamptz,text) to service_role;
grant execute on function public.get_retaguarda_meta_balance_status(bigint) to authenticated;

-- The current balance must be visible after a refresh even when history is
-- filtered to a past period. Resolve the leaf BEFORE discarding missing balances.
create function public.get_retaguarda_latest_balances(p_client_id bigint)
returns setof public.dashboard_retaguarda_financial_entries
language sql stable security invoker set search_path='' as $$
  select distinct on (e.platform,e.account_id) e.*
  from public.dashboard_retaguarda_financial_entries e
  where e.client_id=p_client_id and e.reference_date<=(now() at time zone 'America/Sao_Paulo')::date
    and e.available_balance_brl is not null
    and not exists(select 1 from public.dashboard_retaguarda_financial_entries n where n.previous_id=e.id)
  order by e.platform,e.account_id,e.reference_date desc,e.created_at desc,e.id;
$$;
revoke all on function public.get_retaguarda_latest_balances(bigint) from public,anon,authenticated,service_role;
grant execute on function public.get_retaguarda_latest_balances(bigint) to authenticated;
