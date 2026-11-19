# Retaguarda Meta — integração e ativação

## Estado da entrega

Branch `codex/retaguarda-meta-integracao`, baseada na main do PR #25. Reaproveita PR #27
e preserva as funcionalidades de saldo atual do PR #26. PRs originais/heads preservados.
Automação definitiva sem migration, deploy, ativação de flags/cron ou escrita financeira
em produção. A única intervenção autorizada foi o diagnóstico temporário descrito abaixo,
já removido e desativado. **Código pronto para homologação não é fonte homologada.**

A primeira leitura real confirmou credencial, conta, BRL, prepay e type=20, mas o parser
v1 rejeitou o formato. O parser v2 foi corrigido em desenvolvimento; sua aceitação real e
a correspondência numérica com Fundos disponíveis permanecem pendentes. Credencial
não foi recuperada; fixtures contêm valores sintéticos no formato sanitizado observado.
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
- Parser `meta-stored-balance-pt-br-v2` aceita estritamente o formato observado
  `Saldo disponível (R$#.###,## BRL)`: sem espaço após R$, com sufixo literal BRL,
  duas casas decimais e agrupamento brasileiro válido ou inteiro sem agrupamento.
  Zero explícito é válido; ausência não vira zero. Limite preservado: 999999999999,99.
  Não aceita espaços extras, quebras de linha, formato antigo ou extração genérica de números.
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

Escolhida **uma RPC limitada para saldo atual** com RLS e exclusão de datas futuras.
Por decisão de publicação, o histórico financeiro foi removido integralmente da interface:
sem seção, tabela, filtros, detalhes ou visualização de versões. O histórico continua
imutável no banco. Nenhuma série histórica financeira é consultada pelo frontend.
“Registrar saldo” consulta somente a folha vigente da conta/data pela RPC invoker
`get_retaguarda_financial_day_head`; uma correção referencia essa folha e cria nova versão.
O filtro global continua nos indicadores de marketing, sem afetar saldos ou formulário.

Preservados: último saldo não nulo independente do filtro, zero distinto de ausência,
registro de hoje com período antigo, correções/versões, autoria, origem/horário e autonomia.
Fonte API aparece como Meta Ads API. Nenhuma alteração visual em outras páginas.

`action=status` retorna disponibilidade/backend, papel, conta permitida, cooldown,
conflito e estado de execução. Viewer sem botão; Admin/Editor com botão **desativado**
antes da homologação ou em falha de estado. Bloqueio manual explica efeito no horário.
Polling só na Retaguarda: 60 s normal, 3 s em execução. Sucesso atualiza cards
sem reload; uma falha não elimina última medição.

## Diagnóstico temporário — removido após o primeiro teste

O código de `diagnose-meta-balance` usa o mesmo segredo já disponível no runtime; não modifica
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

### Primeira consulta real — 18/11/2026

Uma invocação operacional autenticada pelo painel oficial, medida às 19:22:58 UTC
(16:22:58 de Brasília), confirmou conta 1063721474298569, BRL, prepay=true e type=20.
Máscara retornada: `{AVAILABLE_PT} ({BRL_SYMBOL}#.###,## {BRL_CODE})`.
Parser v1 recusou com META_BALANCE_FORMAT_UNSUPPORTED; nenhum valor foi normalizado,
nenhuma correspondência com faturamento foi declarada e nenhuma linha financeira foi gravada.
Resposta bruta, credenciais e valores privados não foram incluídos no repositório/PR.

O diagnóstico foi removido; endpoint HEAD retornou 404, flag diagnóstica=false e
expiração encerrada. Credenciais Meta preservadas por comparação dos digests.
As seis funções existentes mantiveram seus hashes de código; versões de execução
avançaram duas posições durante a configuração/desativação dos controles do projeto.

### Correção v2 e segunda consulta — preparada, NÃO autorizada nem executada

A v1 esperava espaço após R$ e omitia BRL. A v2 reconhece apenas o contrato observado;
exemplos de teste como `Saldo disponível (R$1.234,56 BRL)` são **valores fictícios**,
não o saldo da conta. Mantém identidade, moeda, prepay, type=20, precisão e limites.
Diagnóstico agora identifica `parser=meta-stored-balance-pt-br-v2`, além de aceitação,
valor normalizado e máscara sanitizada. Erro continua sem saldo e sem gravação.

Novas medições terão source_key `meta-stored-balance-pt-br-v2:<run_id>`. A proposta de
migration 20261118150949, ainda não aplicada, foi atualizada somente nesse prefixo;
nenhuma migration aplicada ou registro anterior foi alterado. Chaves/versões antigas
continuam preservadas. Rever checksum antes de qualquer futura aplicação.

Validação da correção: 101 testes financeiros aprovados; backend completo com 387
aprovados e 2 ignorados fora do harness; TypeScript e Deno check dos três entrypoints
aprovados. PostgreSQL 17 isolado confirmou source_key v2 no fluxo real de gravação
com Graph sintética, replay, concorrência e preservação do saldo manual. CI do novo
commit é acompanhado no PR #28; não reutilizar o resultado do commit anterior.

Para a segunda consulta, obter **nova autorização explícita**, com uma invocação somente
leitura e comparação próxima na interface da mesma conta. Não reutilizar a autorização
da primeira execução, criar flags ativas ou publicar função antecipadamente. Manter
META_BALANCE_ENABLED/FORMAT_VALIDATED/SCHEDULE_ENABLED desligados e Cron inativo.

Critério de aprovação: HTTP autenticado válido, conta/BRL/prepay/type corretos,
parser v2 aceito, amount decimal normalizado e comparação documentada com Fundos
disponíveis em horário próximo. Registrar horário financeiro e horário da conferência
separadamente em evidência privada. Rejeição, diferença ou falta de acesso à interface
mantém homologação pendente. Não registrar o valor em PR público nem gravar no Supabase.

### Procedimento da segunda consulta real — exige nova autorização específica

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
   valor aceito e parser v2 com Fundos disponíveis em horário próximo. Formato rejeitado não habilita
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
   claim/contexto, leitura da folha vigente com RLS, dispatcher e job inativo. Sem nova tabela operacional.

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
8. Autorizar frontend consolidado; validar ausência de histórico na interface, filtros,
   saldo atual e registro/correção manual pela folha vigente. Não integrar
   PRs originais em paralelo sem tratar a sobreposição já resolvida aqui.
9. Autorizar horário: ligar SCHEDULE_ENABLED, depois executar somente enable.sql;
   confirmar novo job e preservar job de campanhas. Primeira medição API recente exigida.
10. Acompanhar primeiras execuções, botão após cooldown, histórico exclusivamente no banco e sincronizações de mídia.

Rollback: **primeiro desligar job financeiro**, depois flags SCHEDULE_ENABLED/ENABLED;
retornar somente frontend/funções financeiras se necessário. Preservar todos os registros
e log. Sem DROP, DELETE, reset, force-push ou interrupção de campanhas. Reserva incerta
exige investigação antes de recuperação separadamente autorizada.

Referências: [Auth de Edge Functions](https://supabase.com/docs/guides/functions/auth),
[Agendamento](https://supabase.com/docs/guides/functions/schedule-functions),
[Inclusão de Aba Retaguarda — Dashboard](https://app.clickup.com/t/17tn9e9xc14).
