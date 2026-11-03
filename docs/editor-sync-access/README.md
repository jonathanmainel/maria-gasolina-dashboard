# Sincronização manual para Editor

O perfil Editor conseguia editar Metas e Vendas, mas o dashboard e o backend reservavam a sincronização ao Admin. O botão e as verificações de solicitação, reserva e início da coleta agora aceitam Admin e Editor. Viewer continua em consulta.

## Escopo

- Reutiliza os perfis existentes de dashboard_client_users e o vínculo com cliente ativo.
- Atualiza seis funções SECURITY INVOKER, preservando assinaturas, search_path vazio e grants exclusivos para postgres/service_role.
- Mantém a Edge Function de entrada: ela valida a sessão e passa o UUID autenticado ao banco.
- Preserva idempotência, intervalo de cinco minutos, exclusão de coletas simultâneas, período manual, agendamento, seleção imutável de previews e bloqueio de repetição.
- Mantém backfill histórico restrito a Admin, inclusive na nova checagem antes do início.
- Preserva o bloqueio da interface nos modos de apresentação/compartilhamento somente leitura.
- Não altera coletores, integrações, RLS de dados, métricas, registros comerciais, previews ou credenciais.
- A migration não contém usuários de produção nem alterações de perfil. Os perfis solicitados foram tratados separadamente como operação administrativa.

## Validação

- Checagem TypeScript e testes do componente DataRefreshPanel.
- Regressão da interface com o executor tests/manual-sync.playwright.mjs para SYNC_TEST_ROLE=admin e SYNC_TEST_ROLE=editor; desktop e mobile, resposta parcial, atualização dos gráficos após confirmação e Viewer bloqueado. O executor usa Auth/REST/Edge locais simulados e não comprova sessão pessoal em produção.
- tests/editor-sync-permissions.sql executado no Supabase de homologação existente: RPCs reais, reserva e início de métricas/previews para ambos os perfis, Viewer/outro cliente recusados, revogação de papel, idempotência, intervalo, agendamento e backfill administrativo.
- O SQL de homologação exige marcadores RLS_SANDBOX_ONLY. Todos os dados temporários e pedidos pg_net são revertidos em subtransações; nenhum pedido HTTP de teste é confirmado.
- Verificação posterior em produção: perfis, capacidade retornada pelo backend, manutenção dos grants, políticas e dados.

Para repetir o teste de interface, iniciar Vite local na porta 5190 com VITE_SUPABASE_URL=http://127.0.0.1:55499 e VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_MANUAL_SYNC_TEST_ONLY; executar o script duas vezes com SYNC_TEST_ROLE=admin e editor. As chamadas são interceptadas pelo teste e não alcançam serviços externos.

## Publicação e reversão

Aplicar supabase/migrations/20261103110504_allow_editor_manual_sync.sql e publicar o frontend. O identificador corresponde à versão registrada no Supabase de produção. Os coletores e Edge Functions permanecem como estão.

rollback.sql restaura as seis definições exatas anteriores; a reversão do frontend restaura o bloqueio visual a Admin. A reversão não desfaz os perfis dos usuários. Não executar como manutenção rotineira: isso retiraria a nova capacidade dos editores.

