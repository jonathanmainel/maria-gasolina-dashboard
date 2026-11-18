\set ON_ERROR_STOP on
begin;
do $$ begin
  if (select token from private.meta_balance_test_marker)<>'isolated-synthetic-meta-balance' then raise exception 'NOT_ISOLATED_TEST'; end if;
end $$;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into public.dashboard_clients values(1,'test-a','Synthetic A',true),(2,'test-b','Synthetic B',true);
insert into public.dashboard_client_users values
 (1,'00000000-0000-4000-8000-000000000001','admin'),(1,'00000000-0000-4000-8000-000000000002','editor'),
 (1,'00000000-0000-4000-8000-000000000003','viewer'),(2,'00000000-0000-4000-8000-000000000004','admin');
insert into public.dashboard_source_accounts values
 (1,'meta_ads','111','Synthetic Meta',true),(1,'meta_ads','112','Synthetic Meta 2',true),
 (1,'meta_ads','113','Inactive Meta',false),(2,'meta_ads','222','Other client',true);
do $$
declare r jsonb; run_id uuid; original uuid; next_id uuid; n numeric;
begin
  if has_function_privilege('authenticated','public.reserve_retaguarda_meta_balance(text,text,uuid,text,uuid)','execute')
    or has_function_privilege('anon','public.finish_retaguarda_meta_balance(uuid,numeric,timestamptz,text)','execute')
    or has_table_privilege('authenticated','private.retaguarda_balance_runs','select')
    then raise exception 'Excessive privilege'; end if;
  -- Authenticated end users cannot forge a worker result or author.
  begin
    r:=public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'manual','00000000-0000-4000-8000-000000000003');
    raise exception 'Viewer wrote'; exception when insufficient_privilege then null; end;
  begin
    r:=public.reserve_retaguarda_meta_balance('test-b','222',gen_random_uuid(),'manual','00000000-0000-4000-8000-000000000001');
    raise exception 'Cross-client request'; exception when insufficient_privilege then null; end;
  begin
    r:=public.reserve_retaguarda_meta_balance('test-a','113',gen_random_uuid(),'scheduled',null);
    raise exception 'Inactive account'; exception when insufficient_privilege then null; end;
  r:=public.reserve_retaguarda_meta_balance('test-a','111','10000000-0000-4000-8000-000000000001','manual','00000000-0000-4000-8000-000000000001');
  if r->>'state'<>'accepted' then raise exception 'Admin rejected'; end if;
  run_id:=(r->>'run_id')::uuid;
  r:=public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'manual','00000000-0000-4000-8000-000000000002');
  if r->>'state'<>'running' then raise exception 'Concurrent reservation accepted'; end if;
  foreach n in array array[-1::numeric,'NaN'::numeric,'Infinity'::numeric,1.234::numeric] loop
    begin
      r:=public.finish_retaguarda_meta_balance(run_id,n,clock_timestamp(),null);
      raise exception 'Invalid amount accepted'; exception when invalid_parameter_value then null; end;
  end loop;
  r:=public.finish_retaguarda_meta_balance(run_id,0,clock_timestamp(),null);
  if r->>'state'<>'success' then raise exception 'Zero rejected'; end if;
  original:=(r->>'entry_id')::uuid;
  if not exists(select 1 from public.dashboard_retaguarda_financial_entries where id=original and origin='api' and available_balance_brl=0
    and estimated_daily_spend_brl is null and created_by='00000000-0000-4000-8000-000000000001') then raise exception 'Data/author lost'; end if;
  r:=public.finish_retaguarda_meta_balance(run_id,999,clock_timestamp(),null);
  if (r->>'entry_id')::uuid<>original or not (r->>'replayed')::boolean then raise exception 'Repeated finish duplicated'; end if;
  r:=public.reserve_retaguarda_meta_balance('test-a','111','10000000-0000-4000-8000-000000000001','manual','00000000-0000-4000-8000-000000000001');
  if r->>'state'<>'success' or not (r->>'replayed')::boolean then raise exception 'Retry not idempotent'; end if;
  begin
    r:=public.reserve_retaguarda_meta_balance('test-a','111','10000000-0000-4000-8000-000000000001','manual','00000000-0000-4000-8000-000000000002');
    raise exception 'Key reused by different author'; exception when invalid_parameter_value then null; end;
  r:=public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'scheduled',null);
  if r->>'state'<>'cooldown' then raise exception 'Missing rate limit'; end if;
  update private.retaguarda_balance_runs set requested_at=requested_at-interval '6 minutes' where id=run_id;
  r:=public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'manual','00000000-0000-4000-8000-000000000002');
  run_id:=(r->>'run_id')::uuid;
  r:=public.finish_retaguarda_meta_balance(run_id,1234.56,clock_timestamp(),null);
  next_id:=(r->>'entry_id')::uuid;
  if not exists(select 1 from public.dashboard_retaguarda_financial_entries where id=next_id and previous_id=original
    and available_balance_brl=1234.56 and created_by='00000000-0000-4000-8000-000000000002') then raise exception 'Editor/version/precision failed'; end if;
  begin
    update public.dashboard_retaguarda_financial_entries set available_balance_brl=5 where id=original;
    raise exception 'History updated'; exception when sqlstate '55000' then null; end;
  -- Manual correction wins over an in-flight API read; the original chain survives.
  update private.retaguarda_balance_runs set requested_at=requested_at-interval '6 minutes' where id=run_id;
  r:=public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'scheduled',null); run_id:=(r->>'run_id')::uuid;
  insert into public.dashboard_retaguarda_financial_entries(client_id,platform,account_id,reference_date,available_balance_brl,created_by,previous_id)
    select 1,'meta_ads','111',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,100,'00000000-0000-4000-8000-000000000001',next_id;
  r:=public.finish_retaguarda_meta_balance(run_id,99,clock_timestamp(),null);
  if r->>'state'<>'conflict' then raise exception 'Manual concurrent correction overwritten'; end if;
  update private.retaguarda_balance_runs set requested_at=requested_at-interval '61 minutes' where id=run_id;
  r:=public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'scheduled',null);
  if r->>'state'<>'conflict' or r->>'error_code'<>'MANUAL_BALANCE_PRESERVED' then raise exception 'Manual balance not protected'; end if;
  -- Independent account remains available. An expired worker is not automatically retried.
  r:=public.reserve_retaguarda_meta_balance('test-a','112',gen_random_uuid(),'scheduled',null); run_id:=(r->>'run_id')::uuid;
  update private.retaguarda_balance_runs set requested_at=requested_at-interval '3 minutes' where id=run_id;
  r:=public.reserve_retaguarda_meta_balance('test-a','112',gen_random_uuid(),'scheduled',null);
  if r->>'state'<>'indeterminate' then raise exception 'Unknown write retried'; end if;
  if (select count(*) from public.dashboard_retaguarda_financial_entries)<>3 then raise exception 'Duplicate or lost measurements'; end if;
  -- A fresh second client can fail safely without erasing the confirmed balance.
  r:=public.reserve_retaguarda_meta_balance('test-b','222',gen_random_uuid(),'scheduled',null); run_id:=(r->>'run_id')::uuid;
  r:=public.finish_retaguarda_meta_balance(run_id,null,null,'META_NETWORK_OR_TIMEOUT');
  if r->>'state'<>'failed' or exists(select 1 from public.dashboard_retaguarda_financial_entries where client_id=2)
    then raise exception 'Failure created zero or leaked a record'; end if;
  r:=public.reserve_retaguarda_meta_balance('test-b','222',gen_random_uuid(),'scheduled',null);
  if r->>'state'<>'cooldown' then raise exception 'Missing post-failure rate limit'; end if;
  update private.retaguarda_balance_runs set requested_at=requested_at-interval '61 minutes' where id=run_id;
  r:=public.reserve_retaguarda_meta_balance('test-b','222',gen_random_uuid(),'manual','00000000-0000-4000-8000-000000000004');
  run_id:=(r->>'run_id')::uuid;
  begin
    perform public.finish_retaguarda_meta_balance(run_id,null,clock_timestamp(),null);
    raise exception 'Missing amount accepted'; exception when invalid_parameter_value then null; end;
  begin
    perform public.finish_retaguarda_meta_balance(run_id,10,clock_timestamp()-interval '1 day',null);
    raise exception 'Past measurement accepted'; exception when invalid_parameter_value then null; end;
  update public.dashboard_client_users set role='viewer' where client_id=2;
  r:=public.finish_retaguarda_meta_balance(run_id,10,clock_timestamp(),null);
  if r->>'state'<>'conflict' or r->>'error_code'<>'BALANCE_AUTHORIZATION_CHANGED'
    then raise exception 'Revoked role still wrote'; end if;
end $$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
do $$ begin
  if (select count(*) from public.get_retaguarda_latest_balances(1))<>1
    or (select count(*) from public.get_retaguarda_latest_balances(2))<>0
    or (select count(*) from public.get_retaguarda_meta_balance_status(1))<>2
    or (select count(*) from public.get_retaguarda_meta_balance_status(2))<>0 then raise exception 'Member isolation failed'; end if;
  begin
    perform public.reserve_retaguarda_meta_balance('test-a','111',gen_random_uuid(),'scheduled',null);
    raise exception 'Viewer invoked service RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Meta financial SQL checks passed (synthetic, rollback)' as result;
