# Retaguarda Meta — integração e ativação

## Estado da entrega

Branch `codex/retaguarda-meta-integracao`, baseada na main do PR #25. Reaproveita PR #27
e preserva as funcionalidades de saldo atual do PR #26. PRs originais/heads preservados.
Não houve deploy, migration, ativação de flags/cron, alteração de secrets ou escrita
financeira em produção. **Código pronto para homologação não é fonte homologada.**

Token real, permissões, formato de `display_string` e correspondência com Fundos
disponíveis permanecem pendentes. Credencial não foi recuperada; fixtures são sintéticas.
Escopo fixo: projeto `hlqrpreqvvxtkruwsolg`, cliente `maria-gasolina`/ID 1 no executor,
conta `1063721474298569`. Não altera coletores nem jobs de campanhas.

## Fluxo consolidado

- Botão → `request-meta-balance`: `Auth.getUser` e papel Admin/Editor revalidado no banco.
- Cron → `sync-meta-balance`: autenticação secreta de servidor. Ambos usam **o mesmo**
  handler: reserva → claim exclusivo → GET oficial → parser → finalização imutável.
- GET apenas `id,account_id,currency,is_prepay_account,funding_source_details`. Token no
  header, sem redirects/retry/log bruto, timeout 15 s e resposta máxima 32 KiB.
- Valida identidade, BRL, prepay=true e type=20. Não usa balance, orçamento, limite,
  gasto acumulado ou campos de cupons como crédito disponível.
- Parser provisório aceita estritamente `Saldo disponível (R$ 1.234,56)`, com agrupamento
  válido e duas casas. Este é contrato **sintético**. Formato desconhecido é rejeitado,
  sem extrair qualquer número da resposta. Zero explícito válido; ausência não vira zero.
- `META_BALANCE_ENABLED` e `META_BALANCE_FORMAT_VALIDATED` ficam false até prova real.
  Formato diferente exige revisão somente do contrato/parser e testes antes de ativar.

Única persistência de saldo: `dashboard_retaguarda_financial_entries`, origin=api.
Log privado de execuções já proposto no PR #27 guarda estado/reserva, sem payload Meta.
Uma cadeia por conta/data: API sucede apenas folha API. Folha manual/import **do mesmo
dia bloqueia botão e horário** com conflito explícito, sem GET/substituição. No dia
seguinte nova raiz é permitida. Alteração do predecessor durante GET também gera conflito.
Não apagar registros nem alterar origem para contornar essa política aprovada.

Locks/índices preservam raiz e sucessor únicos. Request key idempotente por execução;
claim impede GET duplicado, inclusive em retransmissões simultâneas. Trocar autor/tipo
de disparo na mesma chave é recusado. Manual usa usuário validado; agendado tem
created_by=null e proveniência de sistema no log. Source key referencia parser/execução.
Cooldown 5 min por conta, agendado no máximo uma vez por faixa UTC. Resposta incerta
mantém chave; falha confirmada permite chave nova após cooldown. Reserva sem confirmação
por 2 min exige revisão, sem retry/desbloqueio automático.

Data operacional: America/Sao_Paulo; measured_at é instante de recebimento validado,
separado de created_at, sem prometer atualização instantânea do razão Meta. Mudança
de dia durante coleta é rejeitada. Falha preserva último saldo confirmado.

## PRs #26/#27 e botão

Escolhida **uma RPC limitada para saldo atual** com RLS e exclusão de datas futuras;
histórico continua consultado por período. Não foi incorporada a estratégia de carregar
todo o histórico do PR #26 em paralelo à RPC do PR #27. Consulta pontual conta/dia somente
ao registrar fora do período carregado resolve a folha sem varrer histórico completo.

Preservados: último saldo não nulo independente do filtro, zero distinto de ausência,
registro de hoje com período antigo, correções/versões, autoria, origem/horário e autonomia.
Fonte API aparece como Meta Ads API. Nenhuma alteração visual em outras páginas.

`action=status` retorna disponibilidade/backend, papel, conta permitida, cooldown,
conflito e estado de execução. Viewer sem botão; Admin/Editor com botão **desativado**
antes da homologação ou em falha de estado. Bloqueio manual explica efeito no horário.
Polling só na Retaguarda: 60 s normal, 3 s em execução. Sucesso atualiza cards/histórico
sem reload; uma falha não elimina última medição.

## Diagnóstico temporário, ainda não publicado

`diagnose-meta-balance` usa o mesmo segredo já disponível no runtime; não modifica
sync-meta-ads nem devolve/extrai tokens. POST vazio/{} (máximo 64 bytes), conta/projeto
fixos, um GET, sem SQL, logger, retries ou gravações.

Autorização efetiva: `createSupabaseContext({auth:'secret'})` exige chave administrativa
válida em `apikey`. Chave pública, JWT comum e token de gerenciamento MCP não substituem
essa autenticação. verify_jwt=false delega a validação ao handler, não libera anonimato.

Flag própria false; expiração UTC absoluta obrigatória, no máximo 15 min. Uma tentativa
por instância, consumida antes do GET mesmo em falha. **Não é quota global:** escala ou
reinício pode aceitar outra chamada na janela. Garantia global exigiria persistência,
vedada ao diagnóstico sem escritas. Usar uma invocação operacional controlada, prazo
curto e remoção imediata, nunca como ferramenta contínua.

Saída: conta, moeda, tipo, horário, aceitação/erro do parser, valor normalizado se aceito
e máscara do formato. Dígitos viram #, textos desconhecidos ?, apenas rótulos reconhecidos
e pontuação são preservados. Sem display_string bruto, detalhes de pagamento ou token.
Valor normalizado continua privado; não publicar resposta financeira em PR aberto.

### Procedimento da consulta real — exige autorização específica

1. Autorizar publicação temporária e uma consulta da função no projeto/conta exatos.
   Manter flags financeiras e Cron desligados.
2. Operador define pelo painel autorizado `META_BALANCE_DIAGNOSTIC_ENABLED=true` e
   `META_BALANCE_DIAGNOSTIC_EXPIRES_AT` UTC dentro dos próximos 15 min. Não alterar
   META_ACCESS_TOKEN, versão ou credenciais de campanhas.
3. Publicar exclusivamente a função temporária/imports revisados, sem deploy global.
4. Na ferramenta oficial de teste de Edge Functions, POST `{}` com autenticação
   administrativa existente em apikey; executar **uma vez**. Não copiar chave para chat,
   Git, logs, URL ou argumentos. Se a ferramenta não permitir fornecer essa autenticação
   com segurança, usar executor administrativo previamente autorizado. Se inexistente,
   parar a consulta real até disponibilizá-lo; sessão do painel sozinha não comprova invocador.
5. Registrar evidência privada de conta/BRL/prepay/type, máscara e horário; comparar
   valor aceito com Fundos disponíveis em horário próximo. Formato rejeitado não habilita
   gravações. Se a máscara não permitir confirmar o contrato, obter evidência sanitizada
   autorizada, sem ampliar retorno bruto nem flexibilizar regex genericamente.
6. Desligar flag diagnóstica, remover somente essa função e conferir rota indisponível.
   Expiração protege se remoção falhar. Timeout não autoriza repetir automaticamente.

Probe local existente só pode ser utilizado em ambiente que receba credencial por
mecanismo privado autorizado. Esse acesso não existe atualmente; não procurar token
em arquivos pessoais/navegador nem modificar função publicada para recuperá-lo.

## Scheduler horário pronto, inativo

Leitura de produção confirmou pg_cron/pg_net e nomes Vault dashboard_project_url e
dashboard_cron_secret_key, sem retornar valores. Job existente google-ads-daily-sync
às `0 4 * * *` permanece intacto. Reutilizamos infraestrutura, sem serviço/secret novo.

Nova migration cria atomicamente **inativo** o job:

```text
retaguarda-meta-balance-hourly
7 * * * *
select private.dispatch_retaguarda_meta_balance();
```

Minuto 7 de cada hora. Dispatcher proprietário sem EXECUTE público/service_role lê
Vault internamente, verifica projeto/conta, reserva UUID determinístico por hora e
enfileira POST pg_net para sync-meta-balance. Chave não é retornada; token Meta não
fica no Cron. Dispatch ID rastreado no log, timeout HTTP 30 s. Repetir a hora não
reenvia GET. Runtime exige ainda META_BALANCE_SCHEDULE_ENABLED=true.

Fila aceita não comprova conclusão: conferir estado final e medição. Falha de transporte
ou autenticação pode deixar reserva sem confirmação; revisar log, entry_id/source_key
e resposta pg_net antes de recuperação autorizada. Sem auto-unlock ou retry.

Scripts preparados, não executados remotamente:

- `supabase/operations/retaguarda-meta-hourly-enable.sql`: confirma job/comando,
  projeto Vault e primeira medição API recente; ativa apenas esse job. Flags/runtime e
  parser são pré-requisitos externos obrigatórios, não comprovados pelo script.
- `supabase/operations/retaguarda-meta-hourly-disable.sql`: desliga só esse job,
  preserva configuração/histórico/campanhas.

## Migrations e permissões

Aplicar após autorização, checksums e pré-requisitos, nesta ordem:

1. `20261118150949_retaguarda_meta_balance_collection.sql`: proposta ainda não aplicada
   do PR #27. Integração ajustou **uma linha** de cooldown agendado para próxima faixa UTC;
   exige revisar novo checksum. Nenhuma migration já aplicada foi alterada.
2. `20261118183030_complete_retaguarda_meta_automation.sql`: duas colunas no log existente,
   claim/contexto, dispatcher e job inativo. Sem nova tabela operacional.

Exige migrations financeiras 20261117045349/20261117150000, clientes/vínculos/contas,
helpers de associação/papéis existentes, pg_cron/pg_net e Vault. Colisão no nome do job
aborta. Aplicar somente SQL aprovado em transação com limites de espera no destino
confirmado; validar DDL/grants e registrar exatamente as duas versões no histórico.
Não db push global nem reparar as seis versões antigas.

RPCs mutantes/claim/contexto são somente service_role. Contexto recebe identidade
validada pelo backend; banco revalida Admin/Editor e cliente na reserva/finalização.
Viewer lê próprio cliente com RLS, sem coletar/inserir API/log privado. Funções privilegiadas
com search_path vazio e objetos qualificados. Imutabilidade/grants financeiros preservados.

## Evidência local e limites

Comandos: `npm run typecheck`, `npm test -- --maxWorkers=2 --no-cache --testTimeout=120000`,
`npm run test:meta-balance`, suite sync-vitest, `npm run test:meta-balance:sql`, Playwright
com playwright.retaguarda.config.ts, `npm run build`, `npm run test:sites`.

PostgreSQL 17.6 próprio, descartável, rede none, sem portas, tmpfs: migrations, RLS,
grants, papéis, isolamento, histórico, valores e sessões concorrentes. Fluxo integrado
captura POST do dispatcher e executa handler verdadeiro contra banco real isolado;
Graph API e contratos Cron/Vault/pg_net são doubles. Prova que botão e scheduler usam
mesma cadeia, replay não duplica GET e correção manual bloqueia coleta horária.

Não foi executado daemon pg_cron/pg_net local real nem Auth/PostgREST/OAuth reais nessa
consolidação: helper auth.uid e sessões são sintéticos. Playwright intercepta transporte,
cobre filtros, erro, botão e desktop/tablet/mobile claro/escuro. CI de PR inclui backend
e SQL/fluxo sem credenciais ou deploy. Resultados/contagens finais na descrição do Draft PR.
Sem dependências novas; chunk Retaguarda continua lazy, sem consultas em outras views.
Aviso preexistente de bundles >500 kB não é falha de build.

## Sequência única de ativação e rollback

Cada operação remota abaixo exige autorização; nenhuma foi executada:

1. Diagnóstico real restrito, sem gravação.
2. Parser/valor comparados com Fundos disponíveis; discrepância ou permissão insuficiente
   interrompe ativação, com correção de contrato em desenvolvimento.
3. Aprovar/aplicar apenas as duas incrementais, conferir versões/RLS/grants e job inativo.
4. Publicar request-meta-balance e sync-meta-balance com flags desligados, remover diagnóstico.
5. Homologar sessões reais Admin/Editor/Viewer/outro cliente/anon. Após aprovação, ligar
   ENABLED e FORMAT_VALIDATED; SCHEDULE_ENABLED=false e Cron ainda inativo.
6. Autorizar primeira medição real. Folha manual/import hoje: preservar, aguardar próximo
   dia ou decisão de conciliação; nunca criar valor fictício ou apagar para liberar.
7. Conferir BRL, origem, autoria, instante, referência, source_key/predecessor e replay.
8. Autorizar frontend consolidado; validar filtros, saldo atual e manual. Não integrar
   PRs originais em paralelo sem tratar a sobreposição já resolvida aqui.
9. Autorizar horário: ligar SCHEDULE_ENABLED, depois executar somente enable.sql;
   confirmar novo job e preservar job de campanhas. Primeira medição API recente exigida.
10. Acompanhar primeiras execuções, botão após cooldown, histórico e sincronizações de mídia.

Rollback: **primeiro desligar job financeiro**, depois flags SCHEDULE_ENABLED/ENABLED;
retornar somente frontend/funções financeiras se necessário. Preservar todos os registros
e log. Sem DROP, DELETE, reset, force-push ou interrupção de campanhas. Reserva incerta
exige investigação antes de recuperação separadamente autorizada.

Referências: [Auth de Edge Functions](https://supabase.com/docs/guides/functions/auth),
[Agendamento](https://supabase.com/docs/guides/functions/schedule-functions),
[Inclusão de Aba Retaguarda — Dashboard](https://app.clickup.com/t/17tn9e9xc14).
