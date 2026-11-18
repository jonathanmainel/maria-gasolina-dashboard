-- Completes the UNPUBLISHED financial proposal. No existing collector or job is changed.
alter table private.retaguarda_balance_runs
  add column claimed_at timestamptz,
  add column dispatch_id bigint;

create function public.claim_retaguarda_meta_balance(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.retaguarda_balance_runs%rowtype;
begin
  select * into r from private.retaguarda_balance_runs where id=p_run_id;
  if not found then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meta-balance:'||r.client_id||':'||r.account_id,0));
  select * into r from private.retaguarda_balance_runs where id=p_run_id for update;
  if r.status<>'running' or r.claimed_at is not null then
    return jsonb_build_object('state',r.status,'run_id',r.id,'entry_id',r.entry_id,'error_code',r.error_code,'replayed',true);
  end if;
  if r.requested_at<clock_timestamp()-interval '2 minutes' then
    update private.retaguarda_balance_runs set status='indeterminate',error_code='BALANCE_VERIFICATION_REQUIRED' where id=r.id;
    return jsonb_build_object('state','indeterminate','run_id',r.id);
  end if;
  update private.retaguarda_balance_runs set claimed_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('state','accepted','run_id',r.id);
end;
$$;
revoke all on function public.claim_retaguarda_meta_balance(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_retaguarda_meta_balance(uuid) to service_role;

create function public.get_retaguarda_meta_balance_context(p_client_slug text,p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_client bigint; v_role text; v_accounts jsonb;
begin
  select c.id,m.role into v_client,v_role from public.dashboard_clients c
    join public.dashboard_client_users m on m.client_id=c.id and m.user_id=p_user_id
    where c.slug=p_client_slug and c.active;
  if v_client is null then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('account_id',a.account_id,'status',r.status,'requested_at',r.requested_at,
    'completed_at',r.completed_at,'entry_id',r.entry_id,'error_code',r.error_code,
    'overdue',coalesce(r.status='running' and r.requested_at<now()-interval '2 minutes',false),
    'retry_at',r.requested_at+interval '5 minutes',
    'manual_blocked_today',exists(select 1 from public.dashboard_retaguarda_financial_entries e
      where e.client_id=a.client_id and e.platform='meta_ads' and e.account_id=a.account_id
        and e.reference_date=(now() at time zone 'America/Sao_Paulo')::date and e.origin in ('manual','import')
        and not exists(select 1 from public.dashboard_retaguarda_financial_entries n where n.previous_id=e.id))
    ) order by a.account_id),'[]') into v_accounts
  from public.dashboard_source_accounts a
    left join lateral(select b.* from private.retaguarda_balance_runs b where b.client_id=a.client_id and b.account_id=a.account_id
      order by b.requested_at desc,b.id desc limit 1) r on true
    where a.client_id=v_client and a.source='meta_ads' and a.active;
  return jsonb_build_object('can_request',v_role in ('admin','editor'),'server_time',now(),'accounts',v_accounts);
end;
$$;
revoke all on function public.get_retaguarda_meta_balance_context(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_retaguarda_meta_balance_context(text,uuid) to service_role;

-- Stable UUID per UTC hour: a re-dispatch never creates a new financial execution.
create function private.retaguarda_meta_hour_key(p_at timestamptz)
returns uuid language sql immutable strict set search_path='' as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-8'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select md5('meta-balance:1:1063721474298569:'||floor(extract(epoch from p_at)/3600)::bigint::text) h) q;
$$;
revoke all on function private.retaguarda_meta_hour_key(timestamptz) from public,anon,authenticated,service_role;

create function private.dispatch_retaguarda_meta_balance()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_url text; v_key text; v_request uuid; v_run jsonb; v_dispatch bigint;
begin
  if not exists(select 1 from cron.job where jobname='retaguarda-meta-balance-hourly' and active) then
    return jsonb_build_object('state','disabled');
  end if;
  -- Strict project/account scope. Never return the Vault values or HTTP headers.
  select decrypted_secret into v_url from vault.decrypted_secrets where name='dashboard_project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name='dashboard_cron_secret_key';
  if v_url is distinct from 'https://hlqrpreqvvxtkruwsolg.supabase.co' or v_key is null or length(v_key)=0 then
    return jsonb_build_object('state','unavailable','error_code','BALANCE_DISPATCH_CONFIGURATION');
  end if;
  if not exists(select 1 from public.dashboard_clients where id=1 and slug='maria-gasolina' and active) then
    return jsonb_build_object('state','unavailable');
  end if;
  v_request:=private.retaguarda_meta_hour_key(clock_timestamp());
  v_run:=public.reserve_retaguarda_meta_balance('maria-gasolina','1063721474298569',v_request,'scheduled',null);
  if v_run->>'state'<>'accepted' then return v_run; end if;
  begin
    select net.http_post(url:=v_url||'/functions/v1/sync-meta-balance',
      headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key,'Authorization','Bearer '||v_key),
      body:=jsonb_build_object('client_slug','maria-gasolina','account_id','1063721474298569','request_key',v_request),
      timeout_milliseconds:=30000) into v_dispatch;
    update private.retaguarda_balance_runs set dispatch_id=v_dispatch where id=(v_run->>'run_id')::uuid;
    return jsonb_build_object('state','dispatched','run_id',v_run->>'run_id','dispatch_id',v_dispatch);
  exception when others then
    update private.retaguarda_balance_runs set status='failed',error_code='BALANCE_DISPATCH_FAILED',completed_at=clock_timestamp()
      where id=(v_run->>'run_id')::uuid;
    return jsonb_build_object('state','failed','run_id',v_run->>'run_id','error_code','BALANCE_DISPATCH_FAILED');
  end;
end;
$$;
revoke all on function private.dispatch_retaguarda_meta_balance() from public,anon,authenticated,service_role;

-- One atomic DO: the scheduler never sees an active job during installation.
-- Existing jobs are left intact. An unexpected name collision aborts installation.
do $$ declare v_job bigint; begin
  if exists(select 1 from cron.job where jobname='retaguarda-meta-balance-hourly') then
    raise exception 'Unexpected financial scheduler job already exists';
  end if;
  v_job:=cron.schedule('retaguarda-meta-balance-hourly','7 * * * *','select private.dispatch_retaguarda_meta_balance();');
  perform cron.alter_job(v_job,active:=false);
end $$;
