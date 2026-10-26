-- TESTES PROPOSTOS, NAO EXECUTADOS. psql -X -v ON_ERROR_STOP=1 -d mg_rls_sandbox -f testes-rls.sql
-- SOMENTE PostgreSQL descartavel dedicado. NUNCA executar no projeto Supabase real.
-- CAMADA COMPLEMENTAR. Nao substitui testes-rls-rest.mjs em Supabase isolado.
-- Cria contrato minimo de auth.uid(): testa SQL/RLS; nao valida assinatura de JWT.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
  IF current_database() <> 'mg_rls_sandbox'
     OR to_regclass('public.dashboard_manual_inputs') IS NOT NULL
     OR to_regnamespace('auth') IS NOT NULL
  THEN RAISE EXCEPTION 'Requer banco descartavel mg_rls_sandbox vazio'; END IF;
END
$guard$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$fn$;
GRANT USAGE ON SCHEMA auth, private, public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.dashboard_clients(id bigint PRIMARY KEY, slug text UNIQUE NOT NULL);
CREATE TABLE public.dashboard_client_users(
  client_id bigint REFERENCES public.dashboard_clients(id), user_id uuid REFERENCES auth.users(id),
  role text NOT NULL DEFAULT 'viewer', created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(client_id,user_id),
  CONSTRAINT dashboard_client_users_role_check CHECK(role IN ('viewer','manager','admin'))
);
CREATE TABLE public.dashboard_manual_inputs(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id bigint NOT NULL REFERENCES public.dashboard_clients(id), scope text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(scope ~ '^[a-z0-9_]{3,40}$'), CHECK(jsonb_typeof(payload)='object'), UNIQUE(client_id,scope)
);
ALTER TABLE public.dashboard_client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_manual_inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_client_users_self_select ON public.dashboard_client_users
FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION private.is_dashboard_client_member(p_client_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT EXISTS(SELECT 1 FROM public.dashboard_client_users WHERE client_id=p_client_id AND user_id=(SELECT auth.uid()))
$fn$;
REVOKE ALL ON FUNCTION private.is_dashboard_client_member(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_dashboard_client_member(bigint) TO authenticated;
CREATE POLICY dashboard_manual_inputs_member_select ON public.dashboard_manual_inputs
FOR SELECT TO authenticated USING((SELECT private.is_dashboard_client_member(client_id)));
CREATE POLICY dashboard_manual_inputs_member_insert ON public.dashboard_manual_inputs
FOR INSERT TO authenticated WITH CHECK((SELECT private.is_dashboard_client_member(client_id)));
CREATE POLICY dashboard_manual_inputs_member_update ON public.dashboard_manual_inputs
FOR UPDATE TO authenticated USING((SELECT private.is_dashboard_client_member(client_id)))
WITH CHECK((SELECT private.is_dashboard_client_member(client_id)));
GRANT ALL ON public.dashboard_client_users TO anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.dashboard_manual_inputs TO authenticated;
INSERT INTO public.dashboard_clients VALUES(1,'maria-gasolina');
INSERT INTO auth.users SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,5) n;
INSERT INTO public.dashboard_client_users(client_id,user_id) SELECT 1,id FROM auth.users;
-- Sentinela prova preservacao de metas e campos legados sem reescrita.
INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload)
VALUES(1,'business','{"goals":{"media_budget":12345},"delivery":{"posts_published":3},"legacy_note":"preservar"}');
\ir rls-proposta.sql

BEGIN;
-- Assercoes de catalogo nao substituem as operacoes autenticadas abaixo.
DO $verify_catalog$
BEGIN
  IF NOT has_table_privilege('authenticated','public.dashboard_manual_inputs','DELETE')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='dashboard_manual_inputs' AND policyname='dashboard_manual_inputs_admin_delete' AND cmd='DELETE')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.dashboard_manual_inputs'::regclass
       AND tgname='dashboard_manual_guard' AND NOT tgisinternal AND tgenabled='O')
  THEN RAISE EXCEPTION 'Faltam grant DELETE, policy ou trigger'; END IF;
END
$verify_catalog$;
CREATE FUNCTION pg_temp.ok(label text, success boolean) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF success IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: %',label; END IF;
  RAISE NOTICE 'OK: %',label;
END
$fn$;
CREATE FUNCTION pg_temp.denied(label text, q text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    RAISE NOTICE 'OK negado: %',label; RETURN;
  END;
  RAISE EXCEPTION 'FALHOU: % foi permitido',label;
END
$fn$;
CREATE FUNCTION pg_temp.affected(label text,q text,wanted bigint) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE actual bigint;
BEGIN
  EXECUTE q; GET DIAGNOSTICS actual=ROW_COUNT;
  PERFORM pg_temp.ok(label,actual=wanted);
END
$fn$;
CREATE FUNCTION pg_temp.snapshot(front text) RETURNS jsonb LANGUAGE sql AS $fn$
 SELECT jsonb_build_object('version',1,'origin','manual','front',front,'kind','snapshot','period',null,
   'values',jsonb_build_object('stages',(SELECT jsonb_object_agg(stage,n)
      FROM unnest(CASE WHEN front='franchise'
        THEN ARRAY['lead','contact','recall','fqc','visit_call','cof','pre_contract','waiting','contract','implementation']
        ELSE ARRAY['lead','contact','recall','fqa','visit_proposal','assembly','contract','implementation'] END)
      WITH ORDINALITY AS a(stage,n)), 'stage_days','{}'::jsonb))
$fn$;
UPDATE public.dashboard_client_users SET role='editor' WHERE user_id IN
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005');
UPDATE public.dashboard_client_users SET role='admin' WHERE user_id='00000000-0000-0000-0000-000000000003';
DELETE FROM public.dashboard_client_users WHERE user_id='00000000-0000-0000-0000-000000000004';
INSERT INTO public.dashboard_clients VALUES(2,'outro-cliente-teste');
INSERT INTO public.dashboard_client_users(client_id,user_id,role) VALUES
 (2,'00000000-0000-0000-0000-000000000004','admin'),(2,'00000000-0000-0000-0000-000000000005','editor');
SELECT pg_temp.denied('manager deixa de ser papel valido',
 $$UPDATE public.dashboard_client_users SET role='manager' WHERE client_id=1 AND user_id='00000000-0000-0000-0000-000000000001'$$);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.ok('metas e legado preservados pela aplicacao',
 (SELECT payload->'goals'->>'media_budget'='12345' AND payload->>'legacy_note'='preservar'
  FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='business'));
INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload)
SELECT 1,'crm_snap_'||front,pg_temp.snapshot(front)
FROM unnest(ARRAY['condominium','company','gym','hospital','franchise']) AS f(front);
SELECT pg_temp.ok('editor cria as cinco frentes independentes',
 (SELECT count(*)=5 FROM public.dashboard_manual_inputs WHERE scope LIKE 'crm_snap_%'));
INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES
 (1,'crm_res_condominium_20261001_20261023',
 '{"version":1,"origin":"manual","front":"condominium","kind":"result","period":{"start":"2026-10-01","end":"2026-10-23"},"values":{"contracts_closed":2,"revenue":1234}}');
SELECT pg_temp.affected('editor atualiza meta sem perder outros campos',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{goals,media_budget}','23456') WHERE client_id=1 AND scope='business'$$,1);
INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload)
VALUES(1,'crm_snap_condominium',jsonb_set(pg_temp.snapshot('condominium'),'{values,stages,lead}','40'))
ON CONFLICT(client_id,scope) DO UPDATE SET payload=excluded.payload;
SELECT pg_temp.ok('upsert autorizado e sem contaminacao de frente',
 (SELECT payload->'values'->'stages'->>'lead'='40' FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='crm_snap_condominium')
 AND (SELECT payload->'values'->'stages'->>'lead'='1' FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='crm_snap_company'));
SELECT pg_temp.affected('autoria e horario do navegador sao substituidos',
 $$UPDATE public.dashboard_manual_inputs SET updated_by='00000000-0000-0000-0000-000000000001',updated_at='2000-01-01' WHERE client_id=1 AND scope='crm_snap_company'$$,1);
SELECT pg_temp.ok('autoria deriva da sessao',
 (SELECT updated_by=auth.uid() AND updated_at>'2000-01-02'::timestamptz FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='crm_snap_company'));
SELECT pg_temp.denied('editor nao insere em outro cliente',
 $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(2,'crm_snap_company',pg_temp.snapshot('company'))$$);
SELECT pg_temp.affected('editor nao exclui linha propria',
 $$DELETE FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='crm_snap_company'$$,0);
SELECT pg_temp.denied('scope imutavel',
 $$UPDATE public.dashboard_manual_inputs SET scope='crm_snap_desconhecida' WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('scope comercial nao vira business',
 $$UPDATE public.dashboard_manual_inputs SET scope='business' WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('ID imutavel',
 $$UPDATE public.dashboard_manual_inputs SET id=DEFAULT WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('created_at imutavel',
 $$UPDATE public.dashboard_manual_inputs SET created_at='2000-01-01' WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('front adulterada sem scope correspondente',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{front}','"gym"') WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('escopo desconhecido rejeitado',
 $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(1,'unknown_scope','{}')$$);
SELECT pg_temp.denied('exemplos nao entram como registros operacionais',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{origin}','"demo"') WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('etapa obrigatoria ausente nao vira zero',
 $$UPDATE public.dashboard_manual_inputs SET payload=payload#-'{values,stages,lead}' WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('volume negativo rejeitado',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{values,stages,lead}','-1') WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('contagem fracionada rejeitada',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{values,stages,lead}','1.5') WHERE client_id=1 AND scope='crm_snap_company'$$);
SELECT pg_temp.denied('periodo adulterado rejeitado',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{period,end}','"2026-10-24"') WHERE client_id=1 AND scope='crm_res_condominium_20261001_20261023'$$);
SELECT pg_temp.denied('data inexistente rejeitada',
 $$UPDATE public.dashboard_manual_inputs SET payload=jsonb_set(payload,'{period,start}','"2026-02-30"') WHERE client_id=1 AND scope='crm_res_condominium_20261001_20261023'$$);
SELECT pg_temp.denied('editor nao promove vinculos',
 $$UPDATE public.dashboard_client_users SET role='admin' WHERE client_id=1 AND user_id=auth.uid()$$);

-- Cliente B cria seu proprio registro, que deve permanecer invisivel ao cliente A.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(2,'crm_snap_company',pg_temp.snapshot('company'));
SELECT pg_temp.ok('admin de B nao le A', (SELECT count(*)=0 FROM public.dashboard_manual_inputs WHERE client_id=1));
SELECT pg_temp.affected('admin B nao altera A',
 $$UPDATE public.dashboard_manual_inputs SET payload=pg_temp.snapshot('company') WHERE client_id=1 AND scope='crm_snap_company'$$,0);
SELECT pg_temp.affected('admin B nao exclui A',
 $$DELETE FROM public.dashboard_manual_inputs WHERE client_id=1$$,0);
SELECT pg_temp.denied('admin B nao insere em A',
 $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(1,'crm_snap_gym',pg_temp.snapshot('gym'))$$);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.ok('editor nao le outro cliente',(SELECT count(*)=0 FROM public.dashboard_manual_inputs WHERE client_id=2));
SELECT pg_temp.affected('editor nao altera outro cliente',
 $$UPDATE public.dashboard_manual_inputs SET payload=pg_temp.snapshot('company') WHERE client_id=2$$,0);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.ok('viewer le registros autorizados e nao ve B',
 (SELECT count(*)=7 FROM public.dashboard_manual_inputs WHERE client_id=1)
 AND (SELECT count(*)=0 FROM public.dashboard_manual_inputs WHERE client_id=2));
SELECT pg_temp.denied('viewer nao insere',
 $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(1,'crm_snap_company',pg_temp.snapshot('company'))$$);
SELECT pg_temp.affected('viewer nao atualiza comercial',
 $$UPDATE public.dashboard_manual_inputs SET payload=pg_temp.snapshot('company') WHERE client_id=1 AND scope='crm_snap_company'$$,0);
SELECT pg_temp.affected('viewer nao atualiza metas',
 $$UPDATE public.dashboard_manual_inputs SET payload='{}' WHERE client_id=1 AND scope='business'$$,0);
SELECT pg_temp.affected('viewer nao exclui', $$DELETE FROM public.dashboard_manual_inputs WHERE client_id=1$$,0);
SELECT pg_temp.denied('viewer nao contorna por upsert',
 $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(1,'crm_snap_company',pg_temp.snapshot('company')) ON CONFLICT(client_id,scope) DO UPDATE SET payload=excluded.payload$$);
SELECT pg_temp.denied('viewer nao promove a si proprio',
 $$UPDATE public.dashboard_client_users SET role='admin' WHERE client_id=1 AND user_id=auth.uid()$$);
SELECT pg_temp.denied('viewer nao insere vinculo de editor',
 $$INSERT INTO public.dashboard_client_users(client_id,user_id,role) VALUES(2,auth.uid(),'editor')$$);
SELECT pg_temp.denied('viewer nao exclui vinculos', $$DELETE FROM public.dashboard_client_users WHERE user_id=auth.uid()$$);
SELECT pg_temp.denied('TRUNCATE de vinculos negado', $$TRUNCATE public.dashboard_client_users$$);
SELECT set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
SELECT pg_temp.affected('user_metadata nao concede escrita',
 $$UPDATE public.dashboard_manual_inputs SET payload='{}' WHERE scope='business'$$,0);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.denied('mesmo editor nos dois clientes nao transfere linha',
 $$UPDATE public.dashboard_manual_inputs SET client_id=2 WHERE client_id=1 AND scope='crm_snap_gym'$$);
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.affected('admin atualiza dado proprio',
 $$UPDATE public.dashboard_manual_inputs SET payload=pg_temp.snapshot('hospital') WHERE client_id=1 AND scope='crm_snap_hospital'$$,1);
SELECT pg_temp.affected('admin nao exclui metas/configuracoes', $$DELETE FROM public.dashboard_manual_inputs WHERE scope='business'$$,0);
SELECT pg_temp.affected('admin exclui somente comercial proprio', $$DELETE FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='crm_snap_hospital'$$,1);
SELECT pg_temp.affected('admin A nao exclui B', $$DELETE FROM public.dashboard_manual_inputs WHERE client_id=2$$,0);
SELECT pg_temp.denied('admin sem RPC especifica tambem nao muda vinculos diretamente',
 $$UPDATE public.dashboard_client_users SET role='editor' WHERE client_id=1 AND user_id='00000000-0000-0000-0000-000000000001'$$);

-- Um papel nao se propaga entre clientes do mesmo usuario.
RESET ROLE;
UPDATE public.dashboard_client_users SET role='viewer' WHERE client_id=2 AND user_id='00000000-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.ok('editor A viewer B ainda le B',(SELECT count(*)=1 FROM public.dashboard_manual_inputs WHERE client_id=2));
SELECT pg_temp.affected('editor A viewer B nao escreve B',
 $$UPDATE public.dashboard_manual_inputs SET payload=pg_temp.snapshot('company') WHERE client_id=2$$,0);
-- Rebaixamento pelo operador de teste; token mantido, nova consulta deve negar.
RESET ROLE;
UPDATE public.dashboard_client_users SET role='viewer' WHERE client_id=1 AND user_id='00000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.affected('revogacao vale na proxima consulta sem renovar JWT',
 $$UPDATE public.dashboard_manual_inputs SET payload='{}' WHERE client_id=1 AND scope='business'$$,0);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.ok('sem auth.uid nao le registros', (SELECT count(*)=0 FROM public.dashboard_manual_inputs));
SELECT pg_temp.denied('sem auth.uid nao grava',
 $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(1,'business','{}')$$);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.denied('anon nao le dados manuais', $$SELECT * FROM public.dashboard_manual_inputs$$);
SELECT pg_temp.denied('anon nao le vinculos', $$SELECT * FROM public.dashboard_client_users$$);
SELECT pg_temp.denied('anon nao grava', $$INSERT INTO public.dashboard_manual_inputs(client_id,scope,payload) VALUES(1,'business','{}')$$);
SELECT pg_temp.denied('anon nao trunca vinculos', $$TRUNCATE public.dashboard_client_users$$);
RESET ROLE;
SELECT pg_temp.ok('outro cliente permaneceu intacto',
 (SELECT count(*)=1 FROM public.dashboard_manual_inputs WHERE client_id=2)
 AND (SELECT payload=pg_temp.snapshot('company') FROM public.dashboard_manual_inputs WHERE client_id=2 AND scope='crm_snap_company'));
SELECT pg_temp.ok('metas permanecem legiveis, sem apagar legado',
 (SELECT payload->'goals'->>'media_budget'='23456' AND payload->>'legacy_note'='preservar'
 FROM public.dashboard_manual_inputs WHERE client_id=1 AND scope='business'));
ROLLBACK;
-- Banco descartavel permanece com estrutura proposta e fixture minima. Nenhum
-- registro de teste desta transacao e persistido. Nao copiar para producao.


