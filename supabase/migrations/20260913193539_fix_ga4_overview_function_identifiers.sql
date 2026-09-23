
do $fix$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.get_dashboard_overview(text,date,date)'::regprocedure)
  into v_definition;
  v_definition := replace(v_definition, '22078023', '22023');
  v_definition := replace(v_definition, 'private.dashboard_read_client77577575_client_id', 'private.dashboard_read_client_id');
  execute v_definition;
end;
$fix$;
;
