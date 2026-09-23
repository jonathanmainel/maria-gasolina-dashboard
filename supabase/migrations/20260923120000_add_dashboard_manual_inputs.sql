-- Entrada manual dos dados de negócio do dashboard.
--
-- Por que esta tabela existe
-- --------------------------
-- O funil comercial, as entregas do contrato GT+ e a régua de WhatsApp aparecem
-- no dashboard desde o redesign, mas não têm origem automática: o CRM Elo ainda
-- não expõe API de leitura. Até lá esses números precisam ser digitados na tela
-- e sobreviver a um reload, em qualquer navegador do time.
--
-- Por que não reaproveitar `dashboard_crm_funnel_daily`
-- -----------------------------------------------------
-- Aquela tabela é um destino de ingestão: granularidade diária por etapa e
-- origem, chave única (client_id, source, account_id, metric_date, stage_key,
-- origin_key) e `source` travado em 'crm_ello' por CHECK. Gravar nela totais
-- digitados à mão exigiria inventar um account_id/metric_date sintéticos e
-- colidiria com o primeiro sync real do Elo — que faz upsert sobre a mesma
-- chave. Manter a entrada manual fora do caminho de ingestão deixa a troca
-- futura trivial: o frontend para de ler este escopo e passa a ler o funil real.
--
-- Escopo mínimo: uma linha por (cliente, escopo) com um payload jsonb. Nenhum
-- pipeline, função de ingestão ou RPC existente é alterado por esta migration.

create table if not exists public.dashboard_manual_inputs (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  scope text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_manual_inputs_scope_check
    check (scope ~ '^[a-z0-9_]{3,40}$'),
  constraint dashboard_manual_inputs_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  unique (client_id, scope)
);

create index if not exists dashboard_manual_inputs_client_scope_idx
  on public.dashboard_manual_inputs (client_id, scope);

alter table public.dashboard_manual_inputs enable row level security;

-- Leitura e escrita são liberadas para qualquer membro do cliente: o dashboard é
-- a ferramenta do próprio time que opera a conta, e hoje todos os usuários são
-- criados com role 'viewer'. Se no futuro for preciso separar quem edita, basta
-- trocar a condição por um teste de role em dashboard_client_users.
drop policy if exists dashboard_manual_inputs_member_select on public.dashboard_manual_inputs;
create policy dashboard_manual_inputs_member_select
on public.dashboard_manual_inputs
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_manual_inputs_member_insert on public.dashboard_manual_inputs;
create policy dashboard_manual_inputs_member_insert
on public.dashboard_manual_inputs
for insert
to authenticated
with check ((select private.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_manual_inputs_member_update on public.dashboard_manual_inputs;
create policy dashboard_manual_inputs_member_update
on public.dashboard_manual_inputs
for update
to authenticated
using ((select private.is_dashboard_client_member(client_id)))
with check ((select private.is_dashboard_client_member(client_id)));

grant select, insert, update on public.dashboard_manual_inputs to authenticated;
