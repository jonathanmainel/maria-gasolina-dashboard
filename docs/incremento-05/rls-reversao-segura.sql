-- REVERSAO SEGURA PROPOSTA - NAO EXECUTADA.
-- Recoloca a operacao em leitura, sem restaurar a escrita vulneravel de viewers.
-- Aplicar somente apos autorizacao; preservar previamente DDL/ACL e dados privados.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.dashboard_manual_inputs IN ACCESS EXCLUSIVE MODE;
REVOKE INSERT, UPDATE, DELETE ON public.dashboard_manual_inputs FROM PUBLIC, anon, authenticated;
-- Repeticao segura: recriar somente as tres barreiras emergenciais, sob lock.
DROP POLICY IF EXISTS dashboard_manual_inputs_emergency_no_insert ON public.dashboard_manual_inputs;
DROP POLICY IF EXISTS dashboard_manual_inputs_emergency_no_update ON public.dashboard_manual_inputs;
DROP POLICY IF EXISTS dashboard_manual_inputs_emergency_no_delete ON public.dashboard_manual_inputs;
CREATE POLICY dashboard_manual_inputs_emergency_no_insert ON public.dashboard_manual_inputs
AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY dashboard_manual_inputs_emergency_no_update ON public.dashboard_manual_inputs
AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY dashboard_manual_inputs_emergency_no_delete ON public.dashboard_manual_inputs
AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
-- SELECT, payloads, vinculos, novos papeis e protecao de autoria permanecem.
-- Nao rebaixar editores automaticamente; nao restaurar grants excessivos.
DO $verify_freeze$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_table_privilege(r,'public.dashboard_manual_inputs','INSERT,UPDATE,DELETE')
       OR has_any_column_privilege(r,'public.dashboard_manual_inputs','INSERT,UPDATE')
    THEN RAISE EXCEPTION 'Grant herdado/por coluna ainda permite escrita: %',r; END IF;
  END LOOP;
END
$verify_freeze$;
COMMIT;
