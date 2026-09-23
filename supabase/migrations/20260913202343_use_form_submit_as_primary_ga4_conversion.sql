do $migration$
declare
  v_definition text;
  v_occurrences integer;
begin
  select pg_get_functiondef('public.get_dashboard_overview(text,date,date)'::regprocedure)
  into v_definition;

  v_occurrences := (length(v_definition) - length(replace(v_definition, '''generate_lead''', ''))) / length('''generate_lead''');
  if v_occurrences <> 4 then
    raise exception 'unexpected get_dashboard_overview conversion predicate count: %', v_occurrences;
  end if;

  execute replace(v_definition, '''generate_lead''', '''form_submit''');

  select pg_get_functiondef('public.get_dashboard_ga4_acquisition(text,date,date,integer,jsonb)'::regprocedure)
  into v_definition;

  v_occurrences := (length(v_definition) - length(replace(v_definition, '''generate_lead''', ''))) / length('''generate_lead''');
  if v_occurrences <> 1 then
    raise exception 'unexpected get_dashboard_ga4_acquisition conversion predicate count: %', v_occurrences;
  end if;

  execute replace(v_definition, '''generate_lead''', '''form_submit''');
end;
$migration$;

comment on function public.get_dashboard_overview(text,date,date)
  is 'Dashboard overview. The legacy generate_leads JSON field represents the primary GA4 conversion event form_submit.';
comment on function public.get_dashboard_ga4_acquisition(text,date,date,integer,jsonb)
  is 'GA4 acquisition report. The legacy generate_leads JSON field represents form_submit conversions.';;
