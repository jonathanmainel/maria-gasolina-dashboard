-- PROPOSTA FINAL v3 - NAO APLICADA. Aplicacao somente apos aprovacao expressa.
-- Executor: operador administrativo do banco; nunca navegador/service key no cliente.
-- Executar primeiro em PostgreSQL/Supabase isolado. ON_ERROR_STOP obrigatorio no psql.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.dashboard_client_users, public.dashboard_manual_inputs IN ACCESS EXCLUSIVE MODE;

-- Impede aplicar silenciosamente sobre um estado diferente do auditado.
DO $preflight$
BEGIN
  -- Inventariar todos os clientes: nao converter manager em editor por suposicao.
  IF EXISTS (SELECT 1 FROM public.dashboard_client_users WHERE role = 'manager')
  THEN RAISE EXCEPTION 'Vinculo legado manager encontrado: requer decisao nominal antes da troca do CHECK'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.dashboard_client_users'::regclass
        AND conname='dashboard_client_users_role_check' AND contype='c' AND convalidated)
  THEN RAISE EXCEPTION 'Constraint de papeis ausente ou nao validada: interromper'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dashboard_clients WHERE id = 1 AND slug = 'maria-gasolina')
     OR EXISTS (SELECT 1 FROM public.dashboard_client_users WHERE client_id <> 1 OR role NOT IN ('viewer','admin'))
     OR EXISTS (SELECT 1 FROM public.dashboard_manual_inputs WHERE client_id <> 1)
  THEN RAISE EXCEPTION 'Escopo ou papeis divergentes: revisar proposta antes de aplicar'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN
      ('public.dashboard_client_users'::regclass, 'public.dashboard_manual_inputs'::regclass)
      AND NOT relrowsecurity)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
         AND tablename = 'dashboard_manual_inputs') <> 3
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
         AND tablename = 'dashboard_manual_inputs' AND policyname IN
         ('dashboard_manual_inputs_member_select','dashboard_manual_inputs_member_insert','dashboard_manual_inputs_member_update')) <> 3
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
         AND tablename='dashboard_manual_inputs' AND policyname='dashboard_manual_inputs_member_select'
         AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[]
         AND qual='( SELECT private.is_dashboard_client_member(dashboard_manual_inputs.client_id) AS is_dashboard_client_member)')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
         AND tablename='dashboard_manual_inputs' AND policyname='dashboard_manual_inputs_member_insert'
         AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[])
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
         AND tablename='dashboard_manual_inputs' AND policyname='dashboard_manual_inputs_member_update'
         AND cmd='UPDATE' AND roles=ARRAY['authenticated']::name[])
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
         AND tablename = 'dashboard_client_users') <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
         AND tablename = 'dashboard_client_users' AND policyname = 'dashboard_client_users_self_select'
         AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]
         AND qual = '(user_id = ( SELECT auth.uid() AS uid))')
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.dashboard_manual_inputs'::regclass AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'RLS, politicas ou triggers divergentes: revisar catalogo'; END IF;
END
$preflight$;

-- Ninguem e promovido: muda apenas o conjunto de papeis aceitos.
ALTER TABLE public.dashboard_client_users DROP CONSTRAINT dashboard_client_users_role_check;
ALTER TABLE public.dashboard_client_users ADD CONSTRAINT dashboard_client_users_role_check
  CHECK (role IN ('viewer', 'editor', 'admin'));

-- Sem SECURITY DEFINER: a consulta ve apenas o vinculo do proprio auth.uid(),
-- pela politica self_select existente. Nao recebe user_id fornecido pelo cliente.
CREATE FUNCTION private.dashboard_manual_has_role(p_client_id bigint, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.dashboard_client_users u
    WHERE u.client_id = p_client_id AND u.user_id = (SELECT auth.uid())
      AND u.role = ANY(p_roles)
  );
$fn$;
REVOKE ALL ON FUNCTION private.dashboard_manual_has_role(bigint,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dashboard_manual_has_role(bigint,text[]) TO authenticated;

-- Valida o contrato existente, sem inferir dados ausentes nem reescrever registros.
CREATE FUNCTION private.dashboard_manual_payload_valid(p_scope text, p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  front text; kind text; stages text[]; k text; n numeric;
  vals jsonb; d1 date; d2 date; expected text;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  -- Configuracoes/metas preservadas como JSON: nao reinterpretar campos legados
  -- como resultados comerciais. O leitor comercial consome somente crm_*.
  IF p_scope = 'business' THEN RETURN true; END IF;
  IF NOT (p ?& ARRAY['version','origin','front','kind','period','values'])
     OR p - ARRAY['version','origin','front','kind','period','values'] <> '{}'::jsonb
     OR p->'version' IS DISTINCT FROM '1'::jsonb
     OR p->>'origin' IS DISTINCT FROM 'manual'
  THEN RETURN false; END IF;
  front := p->>'front'; kind := p->>'kind'; vals := p->'values';
  IF front IS NULL OR front NOT IN ('condominium','company','gym','hospital','franchise')
     OR jsonb_typeof(vals) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF kind = 'snapshot' THEN
    IF p_scope <> 'crm_snap_' || front OR p->'period' IS DISTINCT FROM 'null'::jsonb
       OR NOT (vals ?& ARRAY['stages','stage_days'])
       OR vals - ARRAY['stages','stage_days','avg_ticket'] <> '{}'::jsonb
       OR jsonb_typeof(vals->'stages') IS DISTINCT FROM 'object'
       OR jsonb_typeof(vals->'stage_days') IS DISTINCT FROM 'object'
    THEN RETURN false; END IF;
    stages := CASE WHEN front = 'franchise'
      THEN ARRAY['lead','contact','recall','fqc','visit_call','cof','pre_contract','waiting','contract','implementation']
      ELSE ARRAY['lead','contact','recall','fqa','visit_proposal','assembly','contract','implementation'] END;
    IF NOT ((vals->'stages') ?& stages) OR (vals->'stages') - stages <> '{}'::jsonb
       OR (vals->'stage_days') - array_remove(stages,'contract') <> '{}'::jsonb
    THEN RETURN false; END IF;
    FOREACH k IN ARRAY stages LOOP
      IF jsonb_typeof(vals->'stages'->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (vals->'stages'->>k)::numeric;
      IF n < 0 OR n <> trunc(n) OR n > 9007199254740991 THEN RETURN false; END IF;
    END LOOP;
    FOR k IN SELECT jsonb_object_keys(vals->'stage_days') LOOP
      IF jsonb_typeof(vals->'stage_days'->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (vals->'stage_days'->>k)::numeric;
      IF n < 0 OR n > 1.7976931348623157e308 THEN RETURN false; END IF;
    END LOOP;
    IF vals ? 'avg_ticket' THEN
      IF jsonb_typeof(vals->'avg_ticket') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (vals->>'avg_ticket')::numeric;
      IF n < 0 OR n > 1.7976931348623157e308 THEN RETURN false; END IF;
    END IF;
    RETURN true;
  ELSIF kind = 'result' THEN
    IF jsonb_typeof(p->'period') IS DISTINCT FROM 'object'
       OR NOT ((p->'period') ?& ARRAY['start','end'])
       OR (p->'period') - ARRAY['start','end'] <> '{}'::jsonb
       OR (p->'period'->>'start') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR (p->'period'->>'end') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       OR jsonb_typeof(p->'period'->'start') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p->'period'->'end') IS DISTINCT FROM 'string'
       OR NOT (vals ?& ARRAY['contracts_closed','revenue'])
       OR vals - ARRAY['contracts_closed','revenue'] <> '{}'::jsonb
       OR jsonb_typeof(vals->'contracts_closed') IS DISTINCT FROM 'number'
       OR jsonb_typeof(vals->'revenue') IS DISTINCT FROM 'number'
    THEN RETURN false; END IF;
    d1 := (p->'period'->>'start')::date; d2 := (p->'period'->>'end')::date;
    IF to_char(d1,'YYYY-MM-DD') <> p->'period'->>'start'
       OR to_char(d2,'YYYY-MM-DD') <> p->'period'->>'end' OR d1 > d2
    THEN RETURN false; END IF;
    expected := 'crm_res_' || front || '_' || to_char(d1,'YYYYMMDD') || '_' || to_char(d2,'YYYYMMDD');
    n := (vals->>'contracts_closed')::numeric;
    RETURN p_scope = expected AND n >= 0 AND n = trunc(n) AND n <= 9007199254740991
      AND (vals->>'revenue')::numeric BETWEEN 0 AND 1.7976931348623157e308;
  END IF;
  RETURN false;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range
  THEN RETURN false;
END
$fn$;
REVOKE ALL ON FUNCTION private.dashboard_manual_payload_valid(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dashboard_manual_payload_valid(text,jsonb) TO authenticated;

-- Aborta sem alterar payloads se surgirem registros incompativeis desde a auditoria.
DO $validate_existing$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dashboard_manual_inputs
             WHERE NOT private.dashboard_manual_payload_valid(scope,payload))
  THEN RAISE EXCEPTION 'Registro existente incompativel: preservar e revisar antes de aplicar'; END IF;
END
$validate_existing$;

CREATE FUNCTION private.dashboard_manual_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.created_at IS DISTINCT FROM OLD.created_at)
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identidade, cliente, scope e criacao sao imutaveis'; END IF;
  IF NOT private.dashboard_manual_payload_valid(NEW.scope,NEW.payload)
  THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Contrato manual invalido'; END IF;
  -- Autoria e horario autenticados; rejeita sessao sem usuario inclusive via API.
  IF (SELECT auth.uid()) IS NULL
  THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuario autenticado obrigatorio'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := statement_timestamp(); END IF;
  NEW.updated_by := (SELECT auth.uid());
  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION private.dashboard_manual_guard() FROM PUBLIC, anon, authenticated;
-- Trigger novo: nao depende de trigger preexistente. Executa antes do WITH CHECK.
CREATE TRIGGER dashboard_manual_guard BEFORE INSERT OR UPDATE ON public.dashboard_manual_inputs
FOR EACH ROW EXECUTE FUNCTION private.dashboard_manual_guard();

-- Elimina o caminho permissivo antigo, em transacao (nao existe janela aberta).
DROP POLICY dashboard_manual_inputs_member_insert ON public.dashboard_manual_inputs;
DROP POLICY dashboard_manual_inputs_member_update ON public.dashboard_manual_inputs;
-- SELECT por membro e SELECT do proprio vinculo permanecem intactos.
-- USING protege a linha antiga; WITH CHECK protege a resultante; o trigger
-- impede mudar a identidade mesmo quando ambos os clientes autorizam o usuario.
CREATE POLICY dashboard_manual_inputs_editor_insert ON public.dashboard_manual_inputs
FOR INSERT TO authenticated WITH CHECK (
  private.dashboard_manual_has_role(client_id,ARRAY['editor','admin'])
);
CREATE POLICY dashboard_manual_inputs_editor_update ON public.dashboard_manual_inputs
FOR UPDATE TO authenticated
USING (private.dashboard_manual_has_role(client_id,ARRAY['editor','admin']))
WITH CHECK (private.dashboard_manual_has_role(client_id,ARRAY['editor','admin']));
CREATE POLICY dashboard_manual_inputs_admin_delete ON public.dashboard_manual_inputs
FOR DELETE TO authenticated USING (
  scope <> 'business' AND private.dashboard_manual_payload_valid(scope,payload)
  AND private.dashboard_manual_has_role(client_id,ARRAY['admin'])
);

-- Nao altera service_role, proprietario, Auth, demais tabelas ou politicas de midia.
REVOKE ALL ON TABLE public.dashboard_manual_inputs FROM PUBLIC, anon, authenticated;
-- DELETE precisa deste grant E da policy admin_delete; nenhum deles isolado basta.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_manual_inputs TO authenticated;
REVOKE ALL ON TABLE public.dashboard_client_users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.dashboard_client_users TO authenticated;

-- Verifica privilegios efetivos, inclusive heranca. Se houver grant por coluna
-- ou outro papel herdado inesperado, aborta: nao remove permissoes silenciosamente.
DO $postflight$
DECLARE r text; t text; p text;
BEGIN
  IF NOT has_table_privilege('authenticated','public.dashboard_manual_inputs','DELETE')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='dashboard_manual_inputs' AND policyname='dashboard_manual_inputs_admin_delete' AND cmd='DELETE')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.dashboard_manual_inputs'::regclass
       AND tgname='dashboard_manual_guard' AND NOT tgisinternal AND tgenabled='O')
  THEN RAISE EXCEPTION 'Faltam grant DELETE, policy ou trigger habilitado'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['dashboard_client_users','dashboard_manual_inputs'] LOOP
      FOREACH p IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(r,'public.' || t,p)
        THEN RAISE EXCEPTION 'Privilegio excessivo herdado: % %.%',r,t,p; END IF;
      END LOOP;
      IF r = 'anon' OR t = 'dashboard_client_users' THEN
        FOREACH p IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
          IF has_table_privilege(r,'public.' || t,p)
             OR (CASE WHEN p IN ('INSERT','UPDATE') THEN has_any_column_privilege(r,'public.' || t,p) ELSE false END)
          THEN RAISE EXCEPTION 'Gravacao indireta indevida: % %.%',r,t,p; END IF;
        END LOOP;
      END IF;
      IF r = 'anon' AND has_any_column_privilege(r,'public.' || t,'SELECT')
      THEN RAISE EXCEPTION 'Leitura anonima indevida'; END IF;
    END LOOP;
  END LOOP;
END
$postflight$;
COMMIT;



