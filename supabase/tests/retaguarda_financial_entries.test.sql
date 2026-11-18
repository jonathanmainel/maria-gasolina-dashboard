begin;
select '1..1';

insert into auth.users(id, email) values
  ('ff000000-0000-4000-8000-000000000001', 'retaguarda-editor@example.invalid'),
  ('ff000000-0000-4000-8000-000000000002', 'retaguarda-viewer@example.invalid'),
  ('ff000000-0000-4000-8000-000000000003', 'retaguarda-admin@example.invalid');
insert into public.dashboard_clients(id, slug, name) overriding system value values
  (99000001, 'finance-sql-test-a', 'Finance SQL A'), (99000002, 'finance-sql-test-b', 'Finance SQL B');
insert into public.dashboard_client_users(client_id, user_id, role) values
  (99000001, 'ff000000-0000-4000-8000-000000000001', 'editor'),
  (99000001, 'ff000000-0000-4000-8000-000000000002', 'viewer'),
  (99000002, 'ff000000-0000-4000-8000-000000000003', 'admin');
insert into public.dashboard_source_accounts(client_id, source, account_id, active) values
  (99000001, 'meta_ads', 'test-meta', true), (99000001, 'google_ads', 'test-google', true),
  (99000001, 'meta_ads', 'test-disabled', false), (99000001, 'ga4', 'test-ga4', true),
  (99000002, 'meta_ads', 'test-other', true);

set local role authenticated;
set local "request.jwt.claim.sub" = 'ff000000-0000-4000-8000-000000000001';
do $$
declare
  original uuid;
  correction uuid;
  bad numeric;
begin
  if (select count(*) from public.get_retaguarda_financial_accounts(99000001)) <> 3
    or exists (select 1 from public.get_retaguarda_financial_accounts(99000002)) then
    raise exception 'Account projection breached client or platform isolation';
  end if;
  insert into public.dashboard_retaguarda_financial_entries
    (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl)
  values (99000001, 'meta_ads', 'test-meta', date '2026-01-01', 0.00, 1000.99)
  returning id into original;
  if not exists (select 1 from public.dashboard_retaguarda_financial_entries
    where id = original and origin = 'manual' and created_by = auth.uid() and measured_at is not null
      and available_balance_brl = 0 and estimated_daily_spend_brl = 1000.99) then
    raise exception 'Manual author, measurement or exact monetary amount was lost';
  end if;
  insert into public.dashboard_retaguarda_financial_entries
    (client_id, platform, account_id, reference_date, available_balance_brl, previous_id)
  values (99000001, 'meta_ads', 'test-meta', date '2026-01-01', 22.41, original)
  returning id into correction;
  if not exists (select 1 from public.dashboard_retaguarda_financial_entries where id = original and estimated_daily_spend_brl = 1000.99)
    or not exists (select 1 from public.dashboard_retaguarda_financial_entries where id = correction
      and available_balance_brl = 22.41 and estimated_daily_spend_brl is null and previous_id = original) then
    raise exception 'Balance-only correction or previous estimate was lost';
  end if;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, estimated_daily_spend_brl)
    values (99000001, 'meta_ads', 'test-meta', date '2026-01-02', 1);
    raise exception 'An estimate without a balance was accepted for manual entry';
  exception when check_violation then null;
  end;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl, previous_id)
    values (99000001, 'meta_ads', 'test-meta', date '2026-01-01', 1, 1, original);
    raise exception 'Competing correction was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl, previous_id)
    values (99000001, 'google_ads', 'test-google', date '2026-01-01', 1, 1, correction);
    raise exception 'Cross-account predecessor was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl)
    values (99000001, 'meta_ads', 'test-disabled', date '2026-01-01', 1, 1);
    raise exception 'Inactive account accepted a new root';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl, created_by)
    values (99000001, 'meta_ads', 'test-meta', date '2026-01-02', 1, 1, 'ff000000-0000-4000-8000-000000000002');
    raise exception 'Author spoofing was accepted';
  exception when insufficient_privilege then null;
  end;
  foreach bad in array array['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric, -1, 0.001] loop
    begin
      insert into public.dashboard_retaguarda_financial_entries
        (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl)
      values (99000001, 'meta_ads', 'test-meta', date '2026-01-02', bad, 1);
      raise exception 'Invalid monetary amount was accepted';
    exception when check_violation then null;
    end;
  end loop;
  begin
    update public.dashboard_retaguarda_financial_entries set available_balance_brl = 1 where id = correction;
    raise exception 'Update was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = 'ff000000-0000-4000-8000-000000000002';
do $$
begin
  if (select count(*) from public.dashboard_retaguarda_financial_entries) <> 2 then
    raise exception 'Viewer cannot read the history of their client';
  end if;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl)
    values (99000001, 'meta_ads', 'test-meta', date '2026-01-02', 1);
    raise exception 'Viewer wrote a financial record';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local "request.jwt.claim.sub" = 'ff000000-0000-4000-8000-000000000003';
do $$
begin
  if exists (select 1 from public.dashboard_retaguarda_financial_entries) then
    raise exception 'Admin read the history of another client';
  end if;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl, estimated_daily_spend_brl)
    values (99000001, 'meta_ads', 'test-meta', date '2026-01-02', 1, 1);
    raise exception 'Admin wrote financial data for another client';
  exception when insufficient_privilege then null;
  end;
  insert into public.dashboard_retaguarda_financial_entries
    (client_id, platform, account_id, reference_date, available_balance_brl)
  values (99000002, 'meta_ads', 'test-other', date '2026-01-02', 0);
  if not exists (select 1 from public.dashboard_retaguarda_financial_entries
    where client_id = 99000002 and available_balance_brl = 0 and estimated_daily_spend_brl is null) then
    raise exception 'Admin balance-only zero was lost';
  end if;
end;
$$;

set local role service_role;
set local "request.jwt.claim.sub" = '';
do $$
declare original uuid;
begin
  insert into public.dashboard_retaguarda_financial_entries
    (client_id, platform, account_id, reference_date, measured_at, available_balance_brl, origin, source_key)
  values (99000001, 'google_ads', 'test-google', date '2026-01-01', null, 1, 'import', 'form:123')
  returning id into original;
  begin
    insert into public.dashboard_retaguarda_financial_entries
      (client_id, platform, account_id, reference_date, available_balance_brl, origin, source_key)
    values (99000001, 'google_ads', 'test-google', date '2026-01-03', 1, 'import', 'form:123');
    raise exception 'Import source key was processed twice';
  exception when unique_violation then null;
  end;
  insert into public.dashboard_retaguarda_financial_entries
    (client_id, platform, account_id, reference_date, available_balance_brl, origin, source_key, previous_id)
  values (99000001, 'google_ads', 'test-google', date '2026-01-01', 2, 'import', 'form:124', original);
  if (select count(*) from public.dashboard_retaguarda_financial_entries where platform = 'google_ads' and client_id = 99000001) <> 2 then
    raise exception 'Imported revision was not preserved';
  end if;
end;
$$;

reset role;
do $$
begin
  if has_table_privilege('anon', 'public.dashboard_retaguarda_financial_entries', 'select')
    or has_function_privilege('anon', 'public.get_retaguarda_financial_accounts(bigint)', 'execute') then
    raise exception 'Anonymous access enabled';
  end if;
  begin
    delete from public.dashboard_retaguarda_financial_entries where client_id = 99000001;
    raise exception 'History was deleted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;
select 'ok 1 - financial persistence, exact values, versioning, account scope, roles and idempotence';
rollback;
