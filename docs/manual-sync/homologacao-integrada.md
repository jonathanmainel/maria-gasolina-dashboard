# PR #8 — homologação integrada concluída em 28/10/2026

**Resultado:** cadeia de infraestrutura aprovada no Supabase isolado `uwafdxsdsgqysjjxfywo`, com marketing controlado conforme autorização. Nenhuma operação de produção, transferência de secrets de produção, alteração de papéis, novo projeto, cron, merge ou backfill.

Esta homologação comprova Auth, autorização, PostgreSQL, pg_net, funções publicadas, persistência e frontend reais. Não comprova autenticação/autorização nem disponibilidade das APIs Google Ads, Meta e GA4 reais. A falha Meta `190/463` foi provocada pelo teste; não é diagnóstico atual da conta real.

## Resultado por requisito

| Requisito | Evidência e resultado |
|---|---|
| Migration | Aplicado exclusivamente o arquivo `20261027200303_dashboard_manual_sync.sql`, SHA-256 `4c9ec355a8d786879a3e2b3e4f965312aebc6853e2b318304a063eb74c18a27d`. Registro confirmado na história de migrations. |
| Cinco funções | Endpoint e coordenador v1; três coletores v2. Leitura posterior dos 36 arquivos retornados: zero diferenças de conteúdo após normalizar finais de linha e prefixos do pacote. |
| Login/admin | Login real no Auth e verificação de identidade. Endpoint deriva autoria da sessão e banco confirma papel admin. Solicitação manual HTTP 202. |
| Viewer/editor/outro cliente | Viewer consulta o dashboard/status, não vê botão de coleta e recebe HTTP 403 ao tentar disparar diretamente. Editor e admin de outro cliente também recebem 403. Nenhuma promoção ou usuário criado. |
| Backend protegido | JWTs dos quatro perfis não acessam os três coletores/coordenador (401/403). Chamada direta à RPC privilegiada também negada, inclusive com ID do admin no payload. 23 verificações de segurança aprovadas. |
| Cadeia completa | Botão → endpoint autenticado → três reservas com autoria → dispatch_id pg_net → claim do coordenador → claim de cada coletor → RPCs de ingestão reais → dados persistidos → polling e refetch → KPIs. |
| Falha isolada | Primeiro lote: Google Ads e GA4 HTTP 200/success, Meta HTTP 502 e código seguro `META_API_190_463`. UI “Parcialmente concluído”; fontes bem-sucedidas não bloqueadas. |
| Frequência/concorrência | Quatro pedidos simultâneos por lote não criaram coletas adicionais; mesmos UUIDs retornaram reservas originais. Pedido após término, dentro de cinco minutos, retornou cooldown. Segunda atualização manual aceita após cinco minutos reais, sem modificar timestamps. |
| Indeterminado | Resposta interrompida com coletor ainda ativo: status indeterminate, nova solicitação retornou a mesma reserva active. Reconciliação durante trabalho recusada. Somente após recibo terminal independente, reconciliada a linha exata. Zero trabalhos ativos ao concluir. |
| Replay/preservação | Repetir os sete dias completos retornou `already_processed` para Google Ads/GA4, com `write_performed=false`. Falha Meta posterior manteve suas sete linhas anteriores integralmente idênticas. |
| Hoje | Data real no teste: 28/10, fuso São Paulo. Manual: 21–28/10; cron: 21–27/10. Segunda atualização revisou somente as métricas controladas de hoje e manteve uma linha por chave natural. |
| Interface | Playwright Chrome 1440×1100 e 390×844: andamento individual, resultado parcial e completo, visualização Hoje pelo preset existente, aviso de parcial, refetch e atualização de KPI sem reload; zero erros de runtime e zero overflow horizontal. Capturas inspecionadas. |
| Separação | Cinco usuários e oito dados manuais anteriores preservados. Digests de clientes, vínculos, dados manuais e policies existentes coincidem com o inventário inicial. Nenhum cron no ambiente isolado. |

Lotes manuais: primeiro às 01:41:57 e segundo às 01:49:26, horário de Brasília. Google Ads: `b06e2d83-c755-49ba-b303-6b54c9fd7fcd` e `7cf03d9d-4516-40fc-90bf-eb1379badad9`. O segundo lote terminou com as três fontes em success. Nenhum resultado de teste é apresentado como dado real do cliente.

Estado final sintético: 24 linhas diárias (8 por fonte), 16 campanhas, 16 grupos, 16 anúncios, 8 palavras-chave, 8 grupos PMax, 8 recursos PMax e 8 linhas em cada domínio GA4. Hoje: Google Ads custo 24/conversões 4; Meta custo 16/conversões 4; GA4 key events 6. O KPI de mídia mostrou custo 40 e 8 leads. Nos sete dias anteriores, conversões diárias permaneceram 2/2/3, respectivamente. Níveis de campanha/anúncio/PMax não são somados ao diário.

## Correções e diferenças de homologação

- Corrigida a codificação do aviso de dados parciais em `Dashboard.tsx`.
- Arquivos Deno exclusivos de teste excluídos do compilador do frontend; continuam verificados pelo Deno.
- Adicionados adaptador, empacotamento e scripts integrados isolados em `tests/homolog/`. Não são importados por entradas de produção.
- Pacotes dos coletores redirecionam apenas a leitura de configuração dos provedores e o transporte externo para fixtures. A autenticação backend Supabase, a fila e a persistência permanecem reais. O import que contém somente declarações de tipos do Edge Runtime foi omitido nos pacotes isolados devido a timeout do JSR; sem alteração de comportamento executável.
- O ambiente I05 tinha apenas três tabelas. O bootstrap aprovado criou somente os objetos de marketing necessários, contas sintéticas e RLS para os objetos novos. Corrigiu duas referências legadas inválidas no getter copiado para o bootstrap e utilizou SECURITY INVOKER no novo getter PMax. Não altera a migration do PR #8 nem propõe reaplicar esse bootstrap em produção.
- Primeiro ensaio encontrou `Deno.env.set` não suportado no runtime hospedado: nenhuma claim de coletor ou ingestão ocorreu. Logs de boot, pg_net terminal e ausência de gravações confirmados antes de reconciliar essas três reservas como failed. O adaptador foi corrigido e os testes completos repetidos.
- RPC temporária de configuração removida após preparar Vault com chave própria do projeto isolado. Recibos e reconciliação são instrumentos de teste restritos ao backend; não serão publicados em produção.

Advisors do ambiente isolado: sem tabelas novas expostas sem RLS. As duas tabelas de controle/recibos têm RLS sem policy intencionalmente e sem grants para usuários. Resta o aviso de proteção de senhas comprometidas desativada na configuração de Auth existente; não foi alterada. [Referência do aviso](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Testes locais

- Frontend: 603/603; backend: 110/110; foco do controle manual: 9/9.
- TypeScript, Deno dos três wrappers, build e 4 testes de empacotamento aprovados.
- Varredura dos nove arquivos JS/HTML do build QA: nenhum padrão de secret backend, chave privada, JWT service_role, refresh token Google ou source map. Não é prova universal para qualquer formato desconhecido de segredo.
- A primeira execução da suíte encontrou erro de arquivos temporários do executor; os testes focados e a suíte completa passaram ao executar com cache desativado. Não foi alteração de lógica para contornar falha.
- Build possui aviso preexistente de chunks grandes. O build QA contém URL/chave pública do projeto isolado e **não pode ser publicado em produção**; a publicação deve produzir um novo build no pipeline autorizado.

## Ordem exata de integração/publicação — pendente de autorização

1. Registrar revisão, versões/hashes e pacotes reversíveis de produção (frontend, coordenador e três coletores), além do arquivo/hash da migration. Confirmar cron e ausência de trabalhos ativos/indeterminados; se houver, reconciliar antes da transição. Preservar todos os secrets, Service Account e OAuth existentes.
2. Integrar primeiro `codex/google-ads-service-account` (`76a7289`, `514dfda`, `c6a4d0a`) à main, somente após aprovação. **Push/merge na main aciona automaticamente o GitHub Pages:** a autorização dessa integração precisa cobrir esse redeploy, mesmo sem mudança funcional de frontend nessa base. PR #7 não é dependência.
3. Alterar a base do PR #8 para main, revisar o diff restante e executar as verificações. Não integrar o PR #8 ainda. Preservar a correção Service Account e a remoção do Developer Token obrigatório.
4. Aplicar uma vez a migration aprovada em produção. Em erro/timeout, consultar estado antes de qualquer repetição. Não usar o bootstrap da homologação, seus controles, dados sintéticos, Vault ou reconciliação de teste.
5. Fora de uma coleta ativa, publicar o coordenador e depois os três coletores **pelas entradas nativas** em `supabase/functions/*/index.ts`. Publicar o endpoint manual após todos os guards estarem ativos. Não usar os wrappers/adaptadores de homologação. Preservar cron `google-ads-daily-sync`, `0 4 * * *` UTC (01h Brasília), sem criar agendamento ou retry.
6. Validar funções publicadas e dry runs reais sob autorização, sem escrita; confirmar ausência de credenciais/backend no frontend e que a configuração aponta para produção. Só então autorizar o merge do PR #8, que dispara o deploy automático do frontend pelo Pages, com novo build usando os secrets públicos já existentes do pipeline.
7. Fazer homologação operacional com admin/viewer reais e uma atualização manual com escrita expressamente autorizada: sete dias completos mais hoje. Observar o próximo cron de sete dias completos e os resultados individuais. Backfill histórico continua separado e não é executado por esta aprovação.

## Reversão

1. Interromper novas solicitações manuais no endpoint e retornar o frontend ao artefato anterior, com autorização de rollback.
2. Manter reservas e auditoria; não apagar, expirar por idade nem liberar linhas com trabalhos possivelmente ativos. Se um estado for indeterminado, correlacionar run_id, dispatch_id, execução Edge, claims e registros de ingestão. Exigir evidência de encerramento de todos os trabalhos e conferir persistência antes da atualização condicional da linha exata; registrar operador e justificativa. Na falta de evidência, manter o bloqueio.
3. Depois de reconciliar, restaurar coordenador e três coletores como conjunto a partir dos pacotes/hashes registrados, mantendo a autenticação Service Account já ativada e os secrets existentes. Não restaurar OAuth como alternativa automática.
4. Manter migration, histórico e dados. Sem down migration destrutiva, alterações em RLS/papéis ou no cron. Uma correção deve seguir em novo commit revisado; um revert/merge na main também dispara Pages e exige autorização.

O recibo terminal deste teste torna a reconciliação verificável no ambiente isolado. Produção não recebe esse recibo automaticamente: se seus logs e registros não comprovarem encerramento, a fonte permanece bloqueada até análise autorizada. Não há botão público de desbloqueio nem liberação automática por timeout.

Referências: [Auth de funções](https://supabase.com/docs/guides/functions/auth), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [limites de Edge Functions](https://supabase.com/docs/guides/functions/limits).
