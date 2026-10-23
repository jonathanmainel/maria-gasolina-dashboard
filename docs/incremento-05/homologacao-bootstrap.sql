-- SOMENTE HOMOLOGACAO, ANTES de rls-proposta.sql. NAO EXECUTADO.
-- Requer DDL-base auditado e ambiente remoto aprovado, sem dados de producao.
BEGIN;
LOCK TABLE public.dashboard_clients, public.dashboard_client_users, public.dashboard_manual_inputs IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM public.dashboard_clients)
     OR EXISTS(SELECT 1 FROM public.dashboard_client_users)
     OR EXISTS(SELECT 1 FROM public.dashboard_manual_inputs)
     OR EXISTS(SELECT 1 FROM auth.users)
  THEN RAISE EXCEPTION 'Fixture requer projeto/branch vazio. Producao e ambientes existentes bloqueados'; END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.dashboard_manual_inputs'::regclass AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Fixture deve preceder aplicacao da proposta'; END IF;
END
$guard$;
INSERT INTO public.dashboard_clients(id,slug,name) OVERRIDING SYSTEM VALUE
VALUES(1,'maria-gasolina','RLS_SANDBOX_ONLY');
INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload)
VALUES(1,'business','{"goals":{"media_budget":12345},"delivery":{"posts_published":3},"legacy_note":"preservar"}');
COMMIT;
