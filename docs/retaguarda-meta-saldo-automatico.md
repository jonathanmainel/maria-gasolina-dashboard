# Meta Ads — coleta financeira independente (proposta local)

> Registro histórico do PR #27. A consolidação, o diagnóstico temporário, o scheduler
> já implementado e o procedimento vigente estão em
> [Retaguarda Meta — integração e ativação](retaguarda-meta-integracao-ativacao.md).
> As contagens e instruções de ativação abaixo descrevem a versão anterior, não a entrega consolidada.

## Estado e limites

Branch própria baseada na main do PR #25. O PR #26 permanece intacto e sem merge.
Nenhuma escrita, implantação, secret, permissão ou programação de produção foi realizada.
A credencial real `META_ACCESS_TOKEN` permanece exclusivamente no backend de produção:
**não foi extraída, copiada nem usada nos testes locais**. Permissões reais, formato exato
do retorno e comparação API × faturamento **continuam pendentes**. A conferência visual
da conta não comprova permissões do coletor. Fixtures são sintéticas e sanitizadas;
nenhum valor observado na conta é versionado como fixture.

## Arquitetura

- `request-meta-balance`: autentica a sessão por `Auth.getUser`, recusa usuários anônimos e
  passa a identidade verificada ao banco. Não aceita autoria, saldo, origem ou token no JSON.
- `sync-meta-balance`: entrada para um futuro executor horário, protegida pelo mesmo modelo
  `withSupabase({auth: 'secret'})` dos coletores existentes. Não é chamada pela sincronização
  de campanhas e não modifica suas reservas, indicadores ou seu agendamento.
- `_shared/meta-balance.ts`: único GET oficial da conta; token no header, sem redirects,
  timeout de 15 segundos e limite de resposta. Valida ID, `BRL`, `is_prepay_account=true`
  e `funding_source_details.type=20`. `balance` nunca alimenta o saldo disponível.
- A documentação oficial descreve os campos monetários `amount`/`currency` de FundingSourceDetails
  como dados de cupons; não há fallback numérico para esses campos.
- Parser provisório `meta-stored-balance-pt-br-v1`: aceita exclusivamente
  `Saldo disponível (R$ 1.234,56)` e equivalentes numéricos com duas casas. Esse exemplo
  é contrato **sintético para desenvolvimento**, não uma nova captura da API real.
  A versão precisa ser confirmada ou ajustada a uma resposta sanitizada autorizada antes
  de ligar `META_BALANCE_FORMAT_VALIDATED`. Formatos desconhecidos, dívidas, limites,
  valores negativos, NaN/Infinity, moeda diferente e ausência são recusados. Zero explícito é válido.
- A tabela financeira existente continua sendo a única fonte persistida de saldos.
  Uma tabela **privada de execuções**, sem dados brutos da Meta, guarda estado, autoria do
  pedido, deduplicação e reserva por cliente/conta; não duplica o histórico financeiro.
- O botão financeiro solicita uma nova coleta ao backend. Invalidação de cache ocorre
  após a resposta e quando o estado indica uma medição concluída; sozinha não é uma coleta.
- RPC invoker com RLS fornece o último saldo confirmado até hoje, independentemente do filtro
  de histórico. O histórico financeiro e as métricas mantêm o filtro global.

## Política aprovada de versões e conflito

Uma cadeia por cliente/plataforma/conta/data de referência, conforme o modelo existente.
Uma nova medição pode suceder uma versão vigente `api`. Se a versão do **mesmo dia** for
`manual` ou `import`, a execução sinaliza `MANUAL_BALANCE_PRESERVED`, sem consultar/gravar
um novo saldo sobre ela. No dia seguinte pode existir uma nova raiz, preservando os dias anteriores.
Se uma correção ocorrer entre reserva e finalização, o predecessor precisa continuar idêntico;
alteração do histórico causa conflito. Índices de raiz única e sucessor único também protegem
a corrida com inserções manuais. Não há UPDATE/DELETE de registros financeiros.

Autoria manual da coleta vem da sessão validada; execução agendada tem `created_by=null`
e proveniência de sistema no log. `source_key` inclui parser e ID da execução; `request_key`
é único por cliente. Replay devolve a mesma execução/medição sem consultar novamente a API.
Reutilizar chave com outro autor ou tipo de disparo é rejeitado. Falha não vira saldo zero.

Reserva e finalização usam a mesma ordem de locks. Uma conta admite uma execução ativa.
Intervalo mínimo de cinco minutos por conta; execução agendada, no máximo uma por hora.
Reserva sem confirmação por dois minutos fica bloqueada para verificação, sem liberação
ou retentativa automática. O botão conserva a chave após resposta incerta.
Uma execução indeterminada exige análise autorizada do log e da presença de `source_key`/
`entry_id` antes de qualquer decisão de recuperação; não há rotina de limpeza automática.

`reference_date` usa America/Sao_Paulo. `measured_at` é o instante da resposta validada
recebida pelo backend, **não** uma garantia de atualização instantânea do razão da Meta.
`created_at` e horários da execução são independentes. A Meta pode debitar os fundos por
volta de uma vez ao dia; a UI mostra origem/horário e a autonomia continua sendo projeção.
Passagem de dia durante uma coleta ou relógio incompatível é rejeitada, sem reatribuir o dado.

## Segurança e migration incremental

`20261118150949_retaguarda_meta_balance_collection.sql` adiciona o log privado e quatro RPCs.
Não altera as migrations aplicadas, os dados/grants/RLS da tabela financeira nem a coleta Google.
RPCs de reserva/finalização são `service_role` apenas, com `search_path=''`; nenhuma execução
para `PUBLIC`, `anon` ou `authenticated`. O backend é a fronteira confiável para a autoria.
O banco revalida cliente/conta ativos e associação `admin`/`editor` tanto na reserva como na gravação.
Viewer/membro pode ler o estado e os saldos do próprio cliente via RLS; não pode solicitar
coleta, forjar origem API, inspecionar o log privado ou sobrescrever histórico.

Nenhuma programação consta na migration. Ambos os endpoints ficam desativados se
`META_BALANCE_ENABLED` e `META_BALANCE_FORMAT_VALIDATED` não forem explicitamente `true`,
ou se token/versão estiverem ausentes. Template sem credenciais:
`supabase/functions/.env.meta-balance.example`. Valores reais devem ser injetados pelo operador
no backend autorizado, nunca em `VITE_*`, URL, linha de comando, Git ou logs.

## Teste somente leitura futuro no backend autorizado

1. Autorizar execução restrita à conta `1063721474298569` em um ambiente que já disponha
   da mesma credencial de produção; não modificar o coletor publicado para recuperar secrets.
2. Manter os dois flags de gravação desligados. Injetar `META_ACCESS_TOKEN` e `META_API_VERSION`
   pelo mecanismo privado existente e `META_BALANCE_ACCOUNT_ID=1063721474298569`.
3. Executar `scripts/probe-meta-balance.ts` com Deno, limitando rede e variáveis:

   ```sh
   deno run --allow-net=graph.facebook.com --allow-env=META_ACCESS_TOKEN,META_API_VERSION,META_BALANCE_ACCOUNT_ID scripts/probe-meta-balance.ts
   ```

   O script não importa o cliente Supabase e não possui caminho de gravação. Apresenta apenas
   conta, resultado monetário normalizado, horário, moeda e parser, ou código de erro sanitizado.
   Tratar essa saída financeira como privada, sem colar tokens ou dados brutos em relatórios públicos.
4. Comparar em horário próximo com Cobrança e pagamentos → **Fundos disponíveis** na conta
   exata; registrar diferença e horários em evidência privada. Créditos promocionais ficam separados.
5. Se faltar permissão, parar. `funding_source_details` exige tarefa `MANAGE`; não ampliar acessos
   automaticamente e não concluir que a credencial está expirada apenas por erro de permissão.
6. Se o formato for rejeitado, obter uma resposta sanitizada pelo operador autorizado, ajustar
   o contrato/parser e seus testes; nunca flexibilizar a regex para extrair qualquer número.
7. Somente após evidência real coincidente aprovar o formato e a ativação de gravações.

## Validação local reproduzível

```sh
npm run typecheck
npm test -- --maxWorkers=2 --no-cache --testTimeout=120000
npm run test:meta-balance
npm exec -- vitest run --config supabase/functions/sync-vitest.config.ts --configLoader runner
node scripts/test-meta-balance-sql.mjs
npm exec -- playwright test --config playwright.retaguarda.config.ts
npm run build
npm run test:sites
```

O teste SQL cria seu próprio PostgreSQL 17.6 descartável, rede `none`, sem portas, dados
somente em tmpfs e papéis/usuários sintéticos. Aplica a migration financeira original,
a incremental de saldo manual e a nova proposta. Testa permissões reais do PostgreSQL,
RLS, versões, conflitos, moedas/valores no parser e sessões SQL concorrentes.
O helper `auth.uid()` local é uma fixture: **não comprova Auth/PostgREST reais nem OAuth**.
O Playwright intercepta integralmente os serviços; não grava em produção. O modo demo
continua sem coletas, sem saldos fictícios apresentados como reais e sem controles financeiros ativos.

### Evidências desta implementação

- TypeScript: aprovado.
- Frontend: **706 testes / 63 arquivos** aprovados. Uma execução anterior não progrediu
  no ambiente local e foi interrompida; a execução completa com dois workers, sem cache e
  relatório detalhado terminou aprovada. Nenhum teste foi removido ou enfraquecido para isso.
- Backend: **340 aprovados / 1 ignorado** em 19 arquivos, incluindo **54 testes específicos**
  do financeiro (parser, autenticação, coleta, replay, falhas, método e limite de corpo).
- PostgreSQL 17: migration e verificações sintéticas aprovadas; sessões simultâneas
  produziram uma única reserva e uma única medição, inclusive na finalização repetida.
- Playwright: 20 cenários existentes aprovados; mais dois novos cenários do botão/filtro
  e nova execução do Viewer aprovados (23 execuções, 22 cenários distintos).
- Deno: ambos os entrypoints e o probe somente leitura passaram em `deno check`.
- Build e quatro testes Sites aprovados. Aviso preexistente de bundles >500 kB permanece;
  financeiro continua no chunk da Retaguarda, sem consultas nas outras páginas.
- Prévia demo conferida no Chrome local: financeiro indisponível, coleta desativada,
  sem login ou credenciais de produção. Isso não equivale à homologação autenticada real.

## Ativação futura — exige autorização própria

1. Revisar PR e integrar cuidadosamente a sobreposição da leitura atual com o PR #26;
   esta branch usa RPC específica, sem reaplicar/cherry-pick do outro PR.
2. Validar esquema/grants e checksum da migration incremental em homologação; aplicar apenas
   essa migration no destino aprovado, registrando sua versão. Nunca `db push` do histórico inteiro.
3. Homologar Auth/PostgREST com Admin/Editor/Viewer e clientes sintéticos em ambiente próprio.
4. Executar o probe real e comparação visual acima; manter flags desligados até aprovação.
5. Publicar os dois endpoints com seus contratos de autenticação: `request-meta-balance`
   faz validação de JWT no handler; `sync-meta-balance` exige autenticação secreta de servidor.
   O `verify_jwt=false` das duas entradas novas em `config.toml` segue esse modelo de
   validação dentro dos handlers; não torna os endpoints anônimos nem altera entradas existentes.
   Não expor chaves administrativas ao navegador nem alterar secrets de campanhas.
6. Autorizar uma primeira medição **real** e controlada; conferir tabela, autoria, origem,
   predecessor, source_key, status e UI antes de habilitar programação horária.
7. Depois de homologar, usar o executor/credencial administrativa existente para chamar apenas
   `sync-meta-balance` por conta ativa, uma vez por hora. Corpo: `client_slug`, `account_id`,
   `request_key` UUID novo por execução; manter a mesma chave em reenvios. Não ativar nesse ciclo.
8. Publicar frontend somente após banco/API homologados e autorização. Não disparar merge do PR #26.

Recuperação: desligar `META_BALANCE_ENABLED`, suspender apenas o futuro agendamento financeiro
e, se necessário, retornar frontend/endpoints à versão anterior. Preservar tabela e todas as
medições. Campanhas, Meta Insights, Google Ads e GA4 continuam independentes.

Referências: [Ad Account / FundingSourceDetails](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account),
[autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt),
[task Retaguarda](https://app.clickup.com/t/17tn9e9xc14).
