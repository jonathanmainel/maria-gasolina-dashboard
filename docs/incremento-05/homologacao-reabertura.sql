-- RECUPERACAO SOMENTE DO SANDBOX uwafdxsdsgqysjjxfywo.
-- Nao executar em producao. Remove apenas as barreiras do ensaio autorizado.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.dashboard_manual_inputs IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dashboard_clients WHERE id=1 AND slug='maria-gasolina' AND name='RLS_SANDBOX_ONLY')
    OR EXISTS(SELECT 1 FROM public.dashboard_clients WHERE name<>'RLS_SANDBOX_ONLY')
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='dashboard_manual_inputs'
        AND policyname IN ('dashboard_manual_inputs_emergency_no_insert','dashboard_manual_inputs_emergency_no_update','dashboard_manual_inputs_emergency_no_delete')
        AND permissive='RESTRICTIVE')<>3
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.dashboard_manual_inputs'::regclass
        AND tgname='dashboard_manual_guard' AND NOT tgisinternal AND tgenabled='O')
 THEN RAISE EXCEPTION 'Condicoes de recuperacao do sandbox nao atendidas'; END IF;
END
$guard$;
DROP POLICY dashboard_manual_inputs_emergency_no_insert ON public.dashboard_manual_inputs;
DROP POLICY dashboard_manual_inputs_emergency_no_update ON public.dashboard_manual_inputs;
DROP POLICY dashboard_manual_inputs_emergency_no_delete ON public.dashboard_manual_inputs;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dashboard_manual_inputs TO authenticated;
DO $verify$
BEGIN
 IF has_table_privilege('authenticated','public.dashboard_client_users','UPDATE,INSERT,DELETE,TRUNCATE')
 THEN RAISE EXCEPTION 'Escrita de vinculos nao pode ser reaberta'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='dashboard_manual_inputs')<>4
 THEN RAISE EXCEPTION 'Politicas fora da configuracao v3'; END IF;
END
$verify$;
COMMIT;
