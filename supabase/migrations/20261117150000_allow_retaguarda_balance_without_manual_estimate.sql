alter table public.dashboard_retaguarda_financial_entries
  drop constraint retaguarda_finance_origin_data,
  add constraint retaguarda_finance_origin_data check (
    (origin = 'manual' and source_key is null and created_by is not null and measured_at is not null
      and available_balance_brl is not null)
    or (origin in ('import', 'api') and length(btrim(source_key)) > 0 and source_key is not null
      and (available_balance_brl is not null or estimated_daily_spend_brl is not null))
  );
