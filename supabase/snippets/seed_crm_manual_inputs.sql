-- Seed dos dados manuais de CRM da Maria Gasolina
-- ===============================================
--
-- NÃO é uma migration: nada aqui roda sozinho. É um script de operação para
-- rodar uma única vez no SQL Editor do Supabase, com o usuário logado.
--
-- Quando é necessário
-- -------------------
-- O dashboard só cai nos padrões do código (`src/lib/manual-funnel.ts`) quando
-- NÃO existe linha em `dashboard_manual_inputs` para (cliente, 'business').
-- Se alguém já salvou algo pela tela, o payload salvo ganha — e o seed do
-- código nunca aparece. Rode o passo 1 para descobrir em qual caso você está.
--
-- O que este script faz e o que NÃO faz
-- -------------------------------------
--   Altera apenas as chaves `funnel` e `results` do jsonb.
--   Preserva `goals`, `delivery` e qualquer outra chave do payload: o operador
--   `||` do jsonb é um merge raso, então as chaves não citadas ficam intactas.
--   Não cria tabela, não altera schema, não toca em RLS, não altera grants,
--   não apaga linha nenhuma.
--
-- Depois de rodar, os valores continuam normalmente editáveis em
-- "CRM e vendas" — o próximo "Salvar" sobrescreve este seed.

-- ---------------------------------------------------------------------------
-- 1. Diagnóstico: existe payload salvo? O que ele tem hoje?
-- ---------------------------------------------------------------------------
select
  c.slug,
  m.scope,
  m.updated_at,
  jsonb_object_keys_agg.keys                as chaves_do_payload,
  m.payload -> 'funnel'  -> 'franchise'     as funnel_franquias_atual,
  m.payload -> 'results' -> 'franchise'     as resultado_franquias_atual,
  m.payload -> 'goals'                      as goals_atual,
  m.payload -> 'delivery'                   as delivery_atual
from public.dashboard_clients c
left join public.dashboard_manual_inputs m
  on m.client_id = c.id and m.scope = 'business'
left join lateral (
  select jsonb_agg(k order by k) as keys
  from jsonb_object_keys(coalesce(m.payload, '{}'::jsonb)) as k
) jsonb_object_keys_agg on true
where c.slug = 'maria-gasolina';

-- Sem linha (m.scope vem null)  -> o seed do código já aparece. NÃO rode o passo 2.
-- Com linha                     -> o payload salvo ganha. Rode o passo 2.


-- ---------------------------------------------------------------------------
-- 2. Seed cirúrgico: só `funnel` e `results`
-- ---------------------------------------------------------------------------
-- Os valores abaixo são idênticos a `defaultFunnel` / `defaultResults` em
-- src/lib/manual-funnel.ts. Ao mudar um lado, mude o outro.
--
-- Repare que os dois blocos são independentes: Franquias tem 3 cards parados na
-- coluna "Contrato" e 18 em "Implantação" no snapshot, e ainda assim 9
-- contratos fechados no período. Um não deriva do outro.

update public.dashboard_manual_inputs m
set
  payload = m.payload || jsonb_build_object(
    'funnel', jsonb_build_object(
      'franchise', jsonb_build_object(
        'stages', jsonb_build_object(
          'lead', 24, 'contact', 68, 'recall', 31, 'fqc', 22, 'visit_call', 14,
          'cof', 11, 'pre_contract', 7, 'waiting', 4, 'contract', 3, 'implementation', 18
        ),
        'stage_days', jsonb_build_object(
          'lead', 1, 'contact', 2, 'recall', 3, 'fqc', 4, 'visit_call', 5,
          'cof', 6, 'pre_contract', 4, 'waiting', 3, 'implementation', 12
        ),
        'avg_ticket', 84500
      ),
      'condominium', jsonb_build_object(
        'stages', jsonb_build_object(
          'lead', 15, 'contact', 42, 'recall', 18, 'fqa', 14,
          'visit_proposal', 11, 'assembly', 6, 'contract', 2, 'implementation', 9
        ),
        'stage_days', jsonb_build_object(
          'lead', 1, 'contact', 2, 'recall', 3, 'fqa', 4,
          'visit_proposal', 5, 'assembly', 7, 'implementation', 10
        ),
        'avg_ticket', 0
      )
    ),
    'results', jsonb_build_object(
      'franchise',   jsonb_build_object('contracts_closed', 9, 'revenue', 760500),
      'condominium', jsonb_build_object('contracts_closed', 6, 'revenue', 108000)
    )
  ),
  updated_at = now()
from public.dashboard_clients c
where m.client_id = c.id
  and c.slug = 'maria-gasolina'
  and m.scope = 'business';


-- ---------------------------------------------------------------------------
-- 3. Conferência: goals e delivery continuam lá?
-- ---------------------------------------------------------------------------
select
  m.payload -> 'goals'                             as goals_preservado,
  m.payload -> 'delivery'                          as delivery_preservado,
  m.payload -> 'results'                           as resultado_novo,
  m.payload -> 'funnel' -> 'franchise' -> 'stages' as snapshot_franquias_novo
from public.dashboard_manual_inputs m
join public.dashboard_clients c on c.id = m.client_id
where c.slug = 'maria-gasolina' and m.scope = 'business';
