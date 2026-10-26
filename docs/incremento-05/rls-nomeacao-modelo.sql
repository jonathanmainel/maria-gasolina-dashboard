-- MODELO PRIVADO DE NOMEACAO - NAO EXECUTADO; NAO CONTEM IDENTIDADES REAIS.
-- Usar somente DEPOIS da RLS aprovada/aplicada/homologada, por operador confiavel.
-- Preencher UUID confirmado em Auth + vinculo, papel e papel anterior aprovados.
-- Registrar autorizador, operador, horario, UUID, client_id e antes/depois em
-- registro privado de mudanca. Nao versionar lista nominal no repositorio publico.
BEGIN;
SET LOCAL lock_timeout = '5s';
LOCK TABLE public.dashboard_client_users IN SHARE ROW EXCLUSIVE MODE;
DO $nominate$
DECLARE
  target_user uuid := NULL; -- UUID NOMINAL APROVADO; NULL impede execucao acidental.
  target_role text := 'editor'; -- 'admin' exige aprovacao nominal independente.
  expected_role text := 'viewer';
  affected integer;
BEGIN
  IF target_user IS NULL OR target_role NOT IN ('editor','admin')
     OR NOT EXISTS (SELECT 1 FROM public.dashboard_clients WHERE id=1 AND slug='maria-gasolina')
  THEN RAISE EXCEPTION 'Nomeacao individual e cliente precisam ser confirmados'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.dashboard_client_users'::regclass
                 AND conname='dashboard_client_users_role_check'
                 AND pg_get_constraintdef(oid) LIKE '%editor%')
  THEN RAISE EXCEPTION 'Controle de acesso novo ainda nao aplicado'; END IF;
  UPDATE public.dashboard_client_users SET role=target_role
  WHERE client_id=1 AND user_id=target_user AND role=expected_role;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Esperado exatamente um vinculo no papel anterior'; END IF;
END
$nominate$;
COMMIT;
-- Reversao de UMA nomeacao: mesma verificacao nominal, troca inversa de papeis,
-- expectativa do papel novo e filtro client_id=1 AND user_id=<UUID aprovado>.
-- Antes de rebaixar admin, verificar se nao e o ultimo administrador do cliente.
