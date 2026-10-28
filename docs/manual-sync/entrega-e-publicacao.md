# Atualização manual real — preparação de 27/10/2026

**Atualização de 28/10:** homologação integrada em infraestrutura Supabase isolada concluída, com marketing controlado autorizado. Resultados, correções e ordem de publicação/reversão em [homologacao-integrada.md](./homologacao-integrada.md). As seções abaixo registram a preparação anterior; nenhuma publicação da atualização manual em produção ou merge foi executado.

Branch `codex/dashboard-manual-sync`, baseada em `codex/google-ads-service-account` (`c6a4d0a`). O PR compara somente a funcionalidade manual com essa base: não incorpora o PR #7 nem substitui a autenticação Service Account por OAuth antigo. Não houve publicação desta funcionalidade, migration aplicada ou merge.

## Google Ads: ativação autorizada concluída

No Supabase `hlqrpreqvvxtkruwsolg`, somente `GOOGLE_ADS_WRITES_ENABLED` foi alterado para `true`; todos os demais digests permaneceram iguais. JSON de Service Account, OAuth e configuração direta sem MCC preservados. A API de gestão informa agora Google Ads v7, com o mesmo pacote de código publicado como v6: SHA-256 `97df01afbfa0d84d9e175312b189f11003bf138187fd8e41dd8120f1eaaeeec3`. A alteração de configuração não foi novo deploy de código.

Para **26/10**, dry run HTTP 200 e, após sua aprovação técnica, **uma única chamada** com gravação HTTP 200, `ok=true`, `database_write_status=success`:

| Domínio | Linhas |
|---|---:|
| Diário | 1 |
| Campanhas | 4 |
| Grupos | 5 |
| Anúncios | 7 |
| Palavras-chave | 17 |
| Grupos PMax | 1 |
| Recursos PMax | 10 |

Métrica diária persistida: **579 impressões, 42 cliques, 12 conversões, custo 135,050624 na moeda da conta**. Dados por domínio conferidos com as prévias da API. PMax e grupos/anúncios/palavras-chave são níveis distintos e não devem ser somados ao total diário.

Os cinco registros de ingestão 615–619 estão com status `success`; seus hashes foram recalculados a partir dos payloads e coincidem. As sete chaves naturais mantêm zero duplicações. Digests das linhas fora de 26/10 não mudaram. Não houve segunda escrita para testar replay em produção: a repetição e o upsert corrigido foram testados no PostgreSQL descartável.

Cron confirmado: **um único** `google-ads-daily-sync`, ativo, `0 4 * * *` UTC, 01h em São Paulo, chamando `sync-dashboard-daily`. Não foi criado ou alterado cron, retry de 15 minutos ou agendamento adicional. A próxima execução agendada ainda precisa confirmar retomada automática; a escrita já está liberada. A lacuna anterior a 26/10 continua pendente de backfill autorizado.

## Arquitetura implementada localmente

1. **Frontend autenticado:** `DataRefreshPanel` ocupa a região superior existente e chama `request-dashboard-sync` com o JWT de sessão pelo SDK Supabase. Envia somente cliente, fontes e UUID da solicitação; datas, usuário e permissões não vêm do navegador. A espera HTTP tem limite de 15 segundos.
2. **Endpoint:** valida a sessão com `Auth.getUser`, nega sessão anônima e encaminha a identidade verificada às RPCs. O banco verifica cliente ativo e papel **admin** atual. Viewer/editor podem consultar status, sem iniciar coleta. Não usa `user_metadata` como autorização.
3. **Fila durável:** a solicitação reserva uma execução por fonte em `dashboard_automation_runs` e despacha pelo `pg_net` já existente, usando os nomes Vault já presentes. Retorna HTTP 202, sem aguardar as APIs. Não adiciona serviço ou cron.
4. **Exclusão e frequência:** lock transacional e índice único por cliente/fonte cobrem manual e cron; UUID evita reenvio duplicado. Intervalo mínimo de cinco minutos por fonte. Fonte indisponível não impede as outras.
5. **Coordenador interno:** verifica cabeçalhos backend, reivindica cada reserva uma vez e inicia até três plataformas independentemente. Timeout de API de 90 segundos e de RPC de 10 segundos. Cada coletor deve reivindicar a reserva correta antes de gravação; dry run permanece livre de RPCs de escrita.
6. **Persistência:** GAQL, consultas Meta/GA4, normalização e RPCs de ingestão existentes são preservados. A mudança funcional nos coletores é somente o guard de reserva. Há duas correções de declarações de tipos preexistentes em `meta-creative.ts`, sem mudança de preview ou resultado.
7. **Acompanhamento:** o frontend consulta status a cada três segundos enquanto executa e a cada minuto quando ocioso/indeterminado. Consulta também os IDs solicitados, para não perder o resultado se outra execução iniciar. Só invalida os dados de mídia/site após sucesso real confirmado. Uma resposta 200 sem status de persistência não vira sucesso.

As reservas ficam em tabela persistente; o transporte pg_net não garante entrega após todo tipo de reinício. Uma reserva que permaneça sem confirmação será sinalizada para reconciliação, sem reenvio automático.

Se uma chamada expirar e não for possível comprovar seu término, a execução fica `indeterminate` e mantém a exclusão daquela fonte. Não há liberação automática da trava ou retry de coleta. O operador precisa reconciliar o estado; as outras fontes continuam independentes. Erros registram somente códigos permitidos; os códigos numéricos Meta são preservados sem a mensagem livre do provedor.

## Período e interface

Manual: **sete dias anteriores mais hoje**, calculados no backend em `America/Sao_Paulo` (em 27/10: 20–27/10). Cron: **sete dias completos**, sem hoje (20–26/10). Os dois fluxos compartilham a exclusão, não o intervalo de frequência manual.

O botão apresenta Atualizar agora, Iniciando..., Sincronizando..., Concluído, Parcialmente concluído ou Falhou. Estados indeterminados exibem Verificação necessária. O painel separa último sucesso, último dia com dados e última tentativa, com erro seguro por fonte. Uma falha preserva o conteúdo anterior.

A visualização inicial continua terminando ontem. O painel informa quando o gráfico ainda termina antes de hoje e oferece **Ver Hoje · parcial**, que usa o mesmo intervalo do preset Hoje do PeriodPicker. O calendário passa a calcular Hoje no fuso de São Paulo, inclusive se o aparelho estiver em outro fuso. Ao selecionar hoje, um aviso permanece acima dos KPIs: dados parciais sujeitos a atraso e revisão. A página não é recarregada.

No mobile, a ação ocupa uma segunda linha do cabeçalho, e o painel usa a folha responsiva já existente. Fundo opaco, rolagem interna e resultados por fonte foram inspecionados visualmente.

## Banco e funções necessárias — ainda não publicados

Migration `20261027200303_dashboard_manual_sync.sql`, SHA-256 `4c9ec355a8d786879a3e2b3e4f965312aebc6853e2b318304a063eb74c18a27d`:

- Estende a tabela de execuções com autoria, UUID, timestamps de solicitação/worker/coletor, despacho, código seguro e modo de período.
- Adiciona estados queued/indeterminate e índices de exclusão/idempotência.
- Cria seis RPCs públicas `SECURITY INVOKER`, executáveis exclusivamente pelo backend, e um dispatcher privado `SECURITY DEFINER` restrito, que lê Vault.
- Não altera políticas RLS, permissões comerciais, usuários, métricas ou cron. Em produção já existe um admin e sete viewers; nenhum papel foi modificado nesta execução.

Pacote de publicação futuro: endpoint `request-dashboard-sync`, coordenador e os três coletores. Os coletores permanecem em `auth: secret`, com os gateways atuais preservados; o novo endpoint valida o JWT pelo Auth. `supabase/config.toml` explicita também o gateway GA4 já publicado, evitando uma futura publicação com padrão incompatível.

## Testes e limites da evidência

| Verificação | Resultado |
|---|---|
| Frontend completo | 603 testes aprovados. |
| Frontend focado após ajustes finais | 9 testes aprovados. |
| Funções | 110 testes aprovados. |
| PostgreSQL 17 local real | 43 verificações: admin, viewer/editor negados, cliente estrangeiro, 12 solicitações simultâneas com uma aceita, claims únicos, cooldown, isolamento cron/manual, fontes indisponíveis, rastreio de IDs e reprocessamento idempotente de hoje. |
| TypeScript e Deno | Aprovados; cinco entradas backend verificadas. |
| Build e empacotamento | Aprovados, quatro testes do empacotamento aprovados; aviso preexistente de chunks maiores que 500 kB. |
| Bundle navegador | Zero padrões de chaves secretas, PEM, JWT service_role, refresh token, nomes de secrets backend ou source maps. Scan por padrões não é prova universal para qualquer formato de segredo. |
| Playwright Chrome | Desktop 1440×1100 e mobile 390×844: sessão no AuthProvider real com fixture, uma solicitação, polling, falha parcial, refetch após confirmação, KPI 12 ao visualizar Hoje, PeriodPicker Hoje preservado, viewer sem ação, zero chamadas externas e sem overflow após redimensionamento. |

O Playwright usa Auth/REST/Edge/APIs sintéticos e não comprova JWT/RLS/pg_net do Supabase publicado. O PostgreSQL usa banco real descartável, identidades Auth e transporte sintéticos. Somente a coleta Google Ads de 26/10 utilizou API e banco reais neste lote. A homologação integrada da atualização manual exige ambiente Supabase isolado e autorização de publicação; não usar testes de escrita em produção como substituto.

## Ordem proposta de homologação e deploy — exige autorização

1. Revisar o PR separado e sua dependência da branch Service Account. Não fazer merge automático de nenhuma delas.
2. Homologar migration + cinco funções + frontend em Supabase isolado, com credenciais e usuários de teste autorizados. Confirmar sessão real, RLS, dispatcher, timeout, idempotência e viewer negado. Não criar projeto ou credenciais sem autorização.
3. Antes de produção, registrar hashes/versões dos quatro pacotes existentes, frontend e migration; confirmar nenhuma execução ativa/indeterminada conflitante. Se houver, parar para reconciliação. Não apagar ou expirar linhas automaticamente para fazer o índice passar.
4. Aplicar a migration completa, uma vez, somente após aprovação do arquivo/hash. Em erro ou timeout, consultar estado antes de qualquer nova tentativa; sem fragments, rollback automático ou reaplicação presumida.
5. Publicar coordenador, depois os três coletores, depois endpoint manual. Durante a transição o endpoint novo ainda não estará disponível ao usuário. Realizar fora de execução ativa do cron, sem alterar seu agendamento.
6. Publicar frontend com URL/chave pública reais do ambiente autorizado; **não publicar o build QA**, que usa URL loopback e chave sintética. Merge/deploy frontend exigem autorização específica; push da branch não publica Pages.
7. Homologação final com admin real e viewer, sob autorização de coleta; observar resultado por fonte, hoje parcial, métricas e execução automática posterior. Backfill segue em autorização separada.

## Reversão preparada

Primeiro interromper novas solicitações manuais pela retirada do endpoint/retorno do frontend anterior, com ação autorizada. Não limpar reservas enquanto houver worker ou coletor possivelmente em andamento. Após reconciliar, restaurar como conjunto o coordenador e os três coletores aos pacotes anteriores registrados, mantendo Service Account e escrita Google já autorizadas. Preservar a tabela/auditoria e colunas adicionadas; não usar down migration destrutiva ou alterar RLS/usuários. O cron mantém o mesmo nome e expressão.

Referências: [autenticação das Edge Functions](https://supabase.com/docs/guides/functions/auth), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) e [limites das funções](https://supabase.com/docs/guides/functions/limits).
