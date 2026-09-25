-- Preserve legacy generate_leads/form_submit fields for the current frontend,
-- while explicitly stating that no business conversion has been verified.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_dashboard_overview(text,date,date)'::regprocedure)
    into v_definition;
  if v_definition is null
     or position('''current'', v_ga4_current,' in v_definition) = 0
     or position('''previous'', v_ga4_previous,' in v_definition) = 0
     or position('''daily'', v_ga4_daily' in v_definition) = 0 then
    raise exception 'unexpected GA4 overview function contract';
  end if;
  v_definition := replace(v_definition,
    '''current'', v_ga4_current,',
    '''current'', v_ga4_current || jsonb_build_object(''primary_conversion_event'', null, ''primary_conversions'', null, ''primary_conversion_rate'', null),');
  v_definition := replace(v_definition,
    '''previous'', v_ga4_previous,',
    '''previous'', v_ga4_previous || jsonb_build_object(''primary_conversion_event'', null, ''primary_conversions'', null, ''primary_conversion_rate'', null),');
  v_definition := replace(v_definition,
    '''daily'', v_ga4_daily',
    '''daily'', v_ga4_daily,' || chr(10) ||
    '      ''primary_conversion_event'', null,' || chr(10) ||
    '      ''primary_conversions'', null,' || chr(10) ||
    '      ''primary_conversion_rate'', null,' || chr(10) ||
    '      ''business_events_verified'', false,' || chr(10) ||
    '      ''journey_available'', false,' || chr(10) ||
    '      ''form_event_candidates'', jsonb_build_array(''form_start'', ''form_submit'', ''form_submit_sindicos'')');
  execute v_definition;
end;
$migration$;

comment on function public.get_dashboard_overview(text,date,date)
  is 'GA4 analytics reports official key events as conversions. Legacy generate_leads represents raw form_submit events, which are not verified business leads. primary_conversion_event remains null pending tracking audit.';
