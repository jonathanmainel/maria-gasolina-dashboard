# Retaguarda Meta — integração e ativação

## Estado da entrega

Branch `codex/retaguarda-meta-integracao`, baseada na main do PR #25. Reaproveita PR #27
e preserva as funcionalidades de saldo atual do PR #26. PRs originais/heads preservados.
Implantação parcial em 19/11/2026: as duas migrations financeiras incrementais foram
aplicadas/registradas. As 44 entradas anteriores permanecem intactas (46 no total).
Job horário criado inativo; nenhuma função financeira definitiva foi publicada,
nenhuma gravação financeira ou coleta horária foi ativada. Diagnóstico removido/desativado.
A fonte foi homologada em leitura; a persistência e a operação definitiva seguem pendentes.

A leitura real de 19/11/2026 confirmou credencial, conta, BRL, prepay e type=20. O parser
v3 normalizou o valor; a interface atualizada um minuto depois confirmou igualdade
exata em centavos com Fundos disponíveis. V1/v2 haviam rejeitado o formato; a diferença
era U+00A0 antes de BRL, visualmente indistinguível do espaço comum na primeira máscara.
Credencial não foi recuperada; fixtures contêm somente valores sintéticos.
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
- Parser `meta-stored-balance-pt-br-v3` aceita estritamente o formato observado
  `Saldo disponível (R$#.###,##\u00a0BRL)`: sem espaço após R$, com sufixo literal BRL,
  precedido de exatamente um espaço ASCII ou U+00A0 apenas nessa posição,
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

### Correção v2 — evidência histórica, substituída pela v3

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

Para a segunda consulta, era necessária **nova autorização explícita**, com uma invocação somente
leitura e comparação próxima na interface da mesma conta. Não reutilizar a autorização
da primeira execução, criar flags ativas ou publicar função antecipadamente. Manter
META_BALANCE_ENABLED/FORMAT_VALIDATED/SCHEDULE_ENABLED desligados e Cron inativo.

### Homologação real v3 — 19/11/2026

A consulta v2 às 12:37:46 UTC confirmou metadados, mas rejeitou o formato. Uma consulta
adicional explicitamente autorizada às 12:47:47 UTC identificou a máscara
`{AVAILABLE_PT} ({BRL_SYMBOL}#.###,##{NBSP}{BRL_CODE})`. Nenhuma delas gravou saldo.
O diagnóstico passou a representar U+00A0 como `{NBSP}`, evitando a normalização visual.

A v3 permite exatamente um ASCII space ou NBSP antes de BRL, sem `\s`, trim ou
captura genérica. Mantém as validações monetárias e rejeita outros espaços, separadores
repetidos, dívida/orçamento/cupom e formatos incorretos. Prefixo novo e coerente:
`meta-stored-balance-pt-br-v3:<run_id>`; somente migration ainda não aplicada foi ajustada.

Consulta final explicitamente autorizada: 12:50:41.965 UTC, parser v3 aceito, valor
normalizado e conta/BRL/prepay/type=20 confirmados. Às 12:51:41 UTC, faturamento
atualizado da mesma conta confirmou igualdade exata em centavos. A tela anterior
estava desatualizada; nenhum valor privado foi publicado neste documento.
Diagnóstico desativado/removido após cada teste; endpoint HEAD 404. Sem escrita
financeira, migration ou agendamento nessa etapa. Testes financeiros: 122 aprovados;
TypeScript aprovado. Novas etapas de implantação seguem os gates abaixo.

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

**Já aplicadas em produção em 19/11/2026; não reaplicar.** Ordem executada após
autorização, checksums e validação da leitura real:

1. `20261118150949_retaguarda_meta_balance_collection.sql`: versão consolidada do PR #27,
   com cooldown na próxima faixa UTC e proveniência do parser v3. SHA-256:
   `4ae5d4b224cbe3d650d40c9d157e484dd21c69899dd5481293ceb937330eb8ed`.
2. `20261118183030_complete_retaguarda_meta_automation.sql`: duas colunas no log existente,
   claim/contexto, leitura da folha vigente com RLS, dispatcher e job inativo. Sem nova tabela operacional.
   SHA-256: `4bcadc28e21eb17b91a575e80bd12da4a21f9f4c3aac5e90f7064fcf28745080`.

DDL e statements do histórico correspondem aos blobs Git aprovados. Aplicação em uma
transação com lock_timeout=5s/statement_timeout=45s. Digest das 44 entradas anteriores
preservado: `28bb8623cfb9315182a90e486293b04d`. Tabela financeira permaneceu sem registros;
RLS, grants por coluna, políticas Admin/Editor e bloqueio UPDATE/DELETE preservados.

**Ocorrência operacional:** CLI 2.117.0 `db query --linked`, embora documentado no help
como Management API, inicializou uma credencial temporária para `cli_login_postgres`.
Essa inicialização contrariou a restrição operacional; próximas alterações foram
interrompidas para decisão do operador. Credencial expirou em 19/11/2026 13:03:50 UTC;
consulta às 13:03:58 UTC confirmou expiração e zero sessões. Papel não foi alterado
ou excluído manualmente. Não usar comandos de banco da CLI vinculados ao projeto;
prosseguir somente pelo conector administrativo/SQL Editor autorizado, sem inicializar
papéis temporários. Não há segredo ou valor de saldo neste registro.

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

Checklist de operação. Leitura real e migrations concluídas; demais passos ainda
pendentes neste checkpoint. A autorização de publicação existe, mas a retomada após
a ocorrência da CLI aguarda decisão específica do operador.

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
