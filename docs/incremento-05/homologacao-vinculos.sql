-- SOMENTE HOMOLOGACAO, DEPOIS de rls-proposta.sql e de criar 5 contas sinteticas.
-- Nenhum UUID real ou senha consta neste arquivo. NAO EXECUTADO.
BEGIN;
LOCK TABLE public.dashboard_clients, public.dashboard_client_users IN SHARE ROW EXCLUSIVE MODE;
DO $fixtures$
DECLARE
  viewer_id uuid := NULL;
  editor_id uuid := NULL;
  admin_id uuid := NULL;
  other_id uuid := NULL;
  dual_id uuid := NULL;
  ids uuid[];
BEGIN
  ids:=ARRAY[viewer_id,editor_id,admin_id,other_id,dual_id];
  IF array_position(ids,NULL) IS NOT NULL OR (SELECT count(DISTINCT x) FROM unnest(ids) x)<>5
  THEN RAISE EXCEPTION 'Informar 5 UUIDs sinteticos distintos de Auth do sandbox'; END IF;
  IF (SELECT count(*) FROM auth.users)<>5 OR (SELECT count(*) FROM auth.users WHERE id=ANY(ids))<>5
     OR (SELECT count(*) FROM public.dashboard_clients)<>1
     OR NOT EXISTS(SELECT 1 FROM public.dashboard_clients WHERE id=1 AND slug='maria-gasolina' AND name='RLS_SANDBOX_ONLY')
     OR EXISTS(SELECT 1 FROM public.dashboard_client_users)
     OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.dashboard_manual_inputs'::regclass AND tgname='dashboard_manual_guard' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'Ambiente/fixture divergente: nao executar em producao'; END IF;
  INSERT INTO public.dashboard_clients(id,slug,name) OVERRIDING SYSTEM VALUE VALUES(2,'rls-sandbox-b','RLS_SANDBOX_ONLY');
  INSERT INTO public.dashboard_client_users(client_id,user_id,role) VALUES
    (1,viewer_id,'viewer'),(1,editor_id,'editor'),(1,admin_id,'admin'),
    (2,other_id,'admin'),(1,dual_id,'editor'),(2,dual_id,'editor');
END
$fixtures$;
COMMIT;
-- B e demais registros serao criados pela API autenticada no executor REST.
