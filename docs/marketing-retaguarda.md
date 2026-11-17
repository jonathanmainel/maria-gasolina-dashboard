# Marketing · Retaguarda

A aba usa o período global e exibe registros por data de referência, do dia mais recente ao mais antigo. O total inclui os dias ocultos pelo botão **Ver mais**. Zero representa um valor registrado. O traço indica ausência de valor na fonte ou falha de leitura. Os totais somam os valores disponíveis.

| Indicador | Origem |
| --- | --- |
| Google Ads | `dashboard_campaign_daily` com `source=google_ads`. Impressões, cliques e `conversions`, com até seis casas decimais conforme a precisão da coluna. |
| Meta Ads | A mesma tabela com `source=meta_ads`. Cliques de `clicks` (todos os cliques), impressões e leads da ação `lead` que o coletor persiste em `conversions`. |
| Sessões orgânicas | `dashboard_ga4_acquisition_daily.sessions`, filtrado pelos canais Organic Search, Organic Social, Organic Video e Organic Shopping. A interface exibe os canais observados no período. |
| Saldo disponível e estimativa de gastos diários | Registros autenticados de `dashboard_retaguarda_financial_entries`, quando houver valores informados. |

As consultas de campanha usam a chave de cliente, plataforma, conta, campanha e dia, sem depender da classificação comercial. As três leituras usam a sessão do usuário e as políticas existentes de acesso por cliente. O modo demo mostra os estados sem dados e não consulta as tabelas da Retaguarda.

O formulário anterior pede cliques orgânicos. Sessões medem visitas iniciadas no site. Para medir cliques da Pesquisa Google, confirmar a definição com o cliente e avaliar integração com [Google Search Console](https://support.google.com/analytics/answer/13682862?hl=pt-BR).

## Homologação local

1. Instale as dependências com `npm ci`.
2. Inicie `npm run dev -- --host 127.0.0.1` e abra [Retaguarda em modo demo](http://127.0.0.1:5173/dashboard/maria-gasolina?view=retaguarda&demo=1) para conferir navegação, temas e estado vazio.
3. Para conferir o fluxo com dados isolados, execute `npm run test:e2e -- --config playwright.retaguarda.config.ts`. A suíte usa sessão e respostas sintéticas locais para testar os filtros de leitura, a tabela e a resiliência da tela. As capturas ficam em `test-results`.
4. Para homologação autenticada, configure `.env.local` com a URL e a chave pública do Supabase do ambiente autorizado, com o redirecionamento OAuth local configurado. Faça login com um membro do cliente e abra `/dashboard/maria-gasolina?view=retaguarda`. Confira o total de cada fonte para um período fechado e um intervalo sem registros.

## Histórico do formulário

Preservar o arquivo original e mapear os campos antes de importar. Se houver métricas de mídia agregadas por dia, comparar datas, contas e definições com as integrações. Manter os dados legados em registros próprios, com origem identificada, e usar uma única fonte por indicador e dia após a conciliação. O histórico de cliques orgânicos deve manter sua própria definição e unidade.

## Controle financeiro

O [guia do financeiro](retaguarda-financeiro.md) descreve preenchimento, histórico, regras de acesso, validação da migration e preparação do CSV.

Antes de automatizar, confirme regime de pagamento, escopo das contas e disponibilidade de crédito informado pelos provedores. O [campo balance da Meta](https://developers.facebook.com/docs/graph-api/reference/ad-account/) representa valor a pagar e os [orçamentos de conta do Google Ads](https://developers.google.com/google-ads/api/docs/billing/account-budgets) definem limites de gasto.
