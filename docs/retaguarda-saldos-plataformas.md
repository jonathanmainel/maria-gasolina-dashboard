# Saldos das plataformas — investigação de 18/11/2026

Investigação somente leitura. Nenhum saldo, coletor, segredo, agendamento, permissão ou migration de produção foi alterado. Os valores financeiros observados ficam na evidência privada entregue ao operador, fora do Git. Este PR corrige o resumo atual; não implanta coleta de saldo.

## Meta Ads

Fontes oficiais: [Ad Account](https://developers.facebook.com/docs/graph-api/reference/ad-account/) e o contrato `FundingSourceDetails` nela descrito. `balance` é **valor a pagar**; `amount_spent` é gasto e `spend_cap` é limite. Nenhum desses campos será usado como crédito disponível, nem subtraído para produzir um saldo.

Foi executado GET da conta autorizada pelo Explorador oficial da Graph API, sem copiar ou extrair seu token. A resposta foi conferida nas versões v23 e v26. Campos: `id,name,currency,is_prepay_account,funding_source_details,user_tasks,balance`.

- Conta Maria Gasolina Express: `currency=BRL`, `is_prepay_account=true`, `funding_source_details.type=20` (`STORED_BALANCE`).
- `funding_source_details.display_string` identificou explicitamente saldo disponível. O valor coincidiu exatamente com **Fundos disponíveis** na tela autenticada de **Cobrança e pagamentos**, que também descreve consumo do saldo pré-pago. Os créditos promocionais da tela estavam separados e não foram somados ao saldo.
- O usuário da consulta tem tarefa `MANAGE`. A documentação exige essa tarefa na conta para `funding_source_details`. As permissões listadas no Explorer incluem `ads_read`, `ads_management` e `business_management`; isso não prova que todas sejam indispensáveis ou que a credencial do coletor tenha as mesmas permissões.
- A consulta não foi realizada com o segredo de produção do coletor. O coletor existente só consulta metadados de conta/moeda e Insights; nenhum teste alterou sua implantação para acrescentar diagnósticos.
- O conector MCP consultado não expõe os campos financeiros no catálogo. Isso é limitação do conector, não ausência dos campos na API oficial. O Explorer permitiu comprovar a resposta real por outro acesso oficial autorizado.

### Proposta para aprovação separada

Há correspondência comprovada suficiente para propor uma coleta periódica **da Meta**, mas ainda não para afirmar que a coleta existente já pode gravar esses dados.

1. Validar somente em leitura o mesmo GET com a credencial autorizada do coletor, na versão configurada, sem aumentar permissões automaticamente.
2. Preferir campo monetário numérico com semântica documentada, se disponibilizado. A resposta observada fornece o saldo no texto `display_string`: é formato de apresentação, não contrato numérico estável. Se for usado, aceitar exclusivamente o formato previamente validado de saldo disponível em BRL, pré-pago e tipo 20; rejeitar qualquer variação ambígua, moeda diferente, ausência, valor negativo ou valor não finito. Nunca fazer fallback para `balance`, cupom, limite ou projeção.
3. Começar com coleta horária da conta validada, em processo separado da ingestão de mídia: falha financeira não deve interromper métricas. Registrar origem `api`, conta, medição com timezone, referência em São Paulo e identificador idempotente da coleta.
4. Preservar o modelo imutável existente. Nova medição do mesmo dia deve apontar para a versão vigente da mesma conta/data. Em conflito com lançamento manual concorrente, interromper e reconciliar pela regra aprovada; não sobrescrever nem encadear automaticamente sobre uma versão desconhecida. Replay do mesmo identificador não cria outra versão.
5. Homologar parser, permissões, moeda, idempotência, concorrência e alterações de formato. Em erro, preservar o último saldo com aviso de medição antiga; nunca substituir por zero. Manter formulário e todas as versões manuais.
6. Revisar e autorizar implementação/implantação do processo. Não aplicar essa proposta nem coletar periodicamente neste PR.

## Google Ads

Fontes oficiais: [Billing API](https://developers.google.com/google-ads/api/docs/billing/overview), [opções de pagamento](https://support.google.com/google-ads/answer/1704418) e [ajustes financeiros](https://support.google.com/google-ads/answer/1704323).

O faturamento autenticado da conta Maria Gasolina foi consultado visualmente. **Configurações → Como você fará o pagamento** informa **Pré-pago: recarga automática desativada**. O resumo apresenta **Fundos disponíveis**, distinto de custos, pagamentos e orçamento.

A documentação da API expõe setups de faturamento, orçamentos de conta e faturas para faturamento mensal, além de incentivos promocionais com allowlist. Não foi identificado recurso oficial documentado para recuperar o saldo pré-pago geral desta conta. Orçamento de conta/campanha, fatura, incentivo e limite não substituem os fundos disponíveis.

Foi consultado o catálogo de `billing_setup`. Uma consulta mínima de ID/status da conta pelo conector foi recusada por falta de permissão de acesso ao cliente; a mensagem menciona contexto de conta administradora. Não atribuímos isso à credencial do coletor, que é outra integração. Mesmo uma consulta de setup bem-sucedida não comprovaria acesso ao saldo pré-pago.

**Manter o saldo Google manual.** A tela foi usada apenas para conferência humana autorizada: sem scraping de faturamento, automação do navegador como integração, endpoints privados ou extração de credenciais. Não é necessário mudar o regime de pagamento para usar o Dashboard.

## Saldo projetado e autonomia

O último saldo conhecido é uma medição persistida com origem e horário. A média de gasto diário continua independente, calculada pelos sete dias completos em BRL. A autonomia existente divide uma medição recente pelo gasto médio positivo e é identificada como projeção pelo ritmo observado.

Não ativar ainda o **saldo projetado por consumo**. A fórmula seria saldo medido menos gasto posterior, mais recargas e ajustes conciliados. O modelo atual não registra movimentos de recarga/ajuste e o gasto disponível é diário: uma medição no meio do dia não permite separar o gasto anterior do posterior. Além disso, a Meta informa que deduz o saldo aproximadamente uma vez ao dia; gasto de mídia ainda não debitado e a medição financeira podem ter defasagem. Subtrair simplesmente os dias poderia descontar duas vezes ou deixar gasto fora.

Uma futura projeção opcional exige marco temporal compatível, cobertura completa, moeda/unidade verificadas, política de conciliação e registro de recargas/ajustes. Deve aparecer em campo próprio **Saldo projetado**, com intervalo, fonte e aviso de incompletude. Nunca salvar a projeção no campo de saldo disponível confirmado. Sem esses insumos, omitir o valor projetado é a opção operacional confiável.

## Escopo deste PR

- Cards de último saldo conhecido independentes do filtro global, com origem, medição e estado de atualização.
- Histórico e indicadores de marketing continuam seguindo o período; registro manual permite informar hoje mesmo com período antigo selecionado.
- Correções, autoria, permissões e imutabilidade preservadas. Nenhuma migration necessária.
- Testes de consulta, versão vigente, zero/ausência, múltiplas contas, filtro, formulário e perfis; cenários sintéticos isolados não equivalem à gravação em produção.

## Validação local

- `npm run typecheck`: aprovado.
- `npm test -- --maxWorkers=2 --no-cache --testTimeout=120000 --reporter=verbose`: 696 testes em 62 arquivos aprovados. A execução local completa com um worker não progrediu; os testes financeiros isolados passaram e a suíte completa passou com dois workers, alinhada ao paralelismo do CI, sem alterar código para contornar testes.
- `npx playwright test --config playwright.retaguarda.config.ts`: 21 testes aprovados, incluindo 1440, 820 e 390 px, temas dark/light, Editor, Viewer, erros e versões. Todos os lançamentos desses testes são interceptados em fixtures locais; não há conexão de escrita com produção.
- `npm run build`: aprovado, incluindo os arquivos esperados da entrega Sites. Permanece o aviso preexistente de bundles acima de 500 kB; a Retaguarda continua separada em chunk carregado sob demanda.
- `npm run test:sites`: quatro testes aprovados. Prévia local aberta e conferida no navegador em modo demonstração, com financeiro explicitamente indisponível, sem saldo fictício.
