# Google Ads: diagnóstico e recuperação controlada

## Estado confirmado em 26/10/2026

Base: main `1168f9f1890178295ab850fddcf2d01b3e389c53`. A correção está isolada em `codex/google-ads-auth-recovery`. Nada foi publicado ou alterado em credenciais de produção.

A conta ativa do cliente Maria Gasolina é selecionada de `dashboard_source_accounts`, com `source = 'google_ads'`. Os sete domínios terminam em **27/09/2026**, com zero linhas desde 28/09:

| Domínio | Linhas históricas |
|---|---:|
| Diário da conta | 368 |
| Campanhas | 1.144 |
| Grupos de anúncios | 1.025 |
| Anúncios | 1.538 |
| Palavras-chave | 6.893 |
| Grupos de recursos PMax | 397 |
| Recursos PMax | 15.986 |

Última ingestão diária: 28/09/2026 04:00:09 UTC. Última automação bem-sucedida: 28/09/2026 04:00:10 UTC. Desde 29/09 até 26/10 há **28 falhas contínuas**, HTTP 502. Existe ainda uma falha antiga HTTP 405 em 23/09, anterior aos sucessos; ela tem outra causa.

O cron legado `google-ads-daily-sync` continua ativo às `0 4 * * *` UTC (01:00 em São Paulo). Chama o coordenador `sync-dashboard-daily`, que processa fontes separadamente. O período diário cobre os sete dias completos anteriores. Meta Ads e GA4 têm coletores próprios; não são alterados aqui.

## Causa comprovada e limite da evidência

Fluxo: cron → coordenador → `sync-google-ads` → POST `oauth2.googleapis.com/token` → consultas GAQL → normalização → cinco RPCs de ingestão para sete domínios.

As credenciais OAuth vêm exclusivamente dos secrets de Edge Functions: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`. O access token é obtido em cada execução, sem persistência ou renovação do refresh token pelo coletor. Os nomes adicionais são `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` e `GOOGLE_ADS_API_VERSION` (default v25). Os valores não foram lidos nem registrados.

Uma chamada diagnóstica da função publicada, para um dia e `dry_run: true`, retornou HTTP 502, `google_ads_api_called: false`, `database_write_performed: false` e **“Google OAuth token exchange failed: Bad Request”**. O transporte não sofreu timeout. O testador oficial havia sido recusado antes disso com HTTP 401 por usar chave pública numa função interna; esse 401 não é a causa do cron.

Portanto, está comprovada a falha na etapa OAuth, antes do developer token, MCC, campanhas ou persistência. **A causa específica da rejeição OAuth ainda não foi identificada.** Não há evidência suficiente para afirmar expiração, revogação ou client incorreto.

Há dois defeitos comprovados no diagnóstico: o helper escolhe `error_description` antes de `error`, perdendo o código original quando a descrição é genérica; o coordenador conserva somente `error` e descarta o detalhe. Os logs disponíveis têm boot/shutdown e status, sem o código OAuth original.

## Alterações deste PR

- Mantém o endpoint e sua proteção `withSupabase({ auth: 'secret' })`. Extrai o handler para testes de integração com HTTP/banco simulados.
- Preserva códigos OAuth permitidos e o subtipo `invalid_rapt`, status HTTP upstream e etapa. Distingue transporte, resposta inválida, autorização Google Ads e persistência. Nunca devolve ou registra corpo bruto, descrição livre, tokens ou headers.
- Registra um evento seguro na função e faz o coordenador persistir o resumo seguro **somente para Google Ads**. O tratamento das outras fontes permanece igual.
- Impõe limites de tempo e rejeita redirecionamentos; não faz retries automáticos. Erros em um batch SearchStream HTTP 200 deixam de ser confundidos com ausência de dados.
- Preserva GAQL, conversões, all_conversions, micros→unidades monetárias, atribuição de frentes e RPCs existentes.
- Para recuperação, confere `expected_account_ids` antes de qualquer coleta/escrita. Responde com `recovery_contract_version: 1`; o executor recusa uma função legada que ignore essa proteção.
- Não acrescenta migrations, não modifica RLS/grants/vínculos, flags comerciais, Meta Ads, GA4 ou UI.

Isso corrige a perda de diagnóstico e prepara uma recuperação segura. **Não equivale a declarar a autenticação de produção restabelecida.** O próximo código OAuth precisa ser observado na execução real após uma publicação especificamente autorizada, ou obtido pelo operador no ambiente seguro que já contém as credenciais.

## Intervenção de credenciais, somente se necessária

1. Identificar o projeto Google Cloud e o mesmo OAuth Client configurado na função. Conferir API Google Ads habilitada, tipo do cliente, Audience/Testing, escopo `https://www.googleapis.com/auth/adwords` e conta Google com acesso à conta/MCC esperados. Não usar a conexão OAuth de outro produto como prova desta configuração.
2. Obter o código OAuth original com o diagnóstico seguro. `invalid_client`, `invalid_grant`, `invalid_scope`, políticas de sessão e transporte exigem procedimentos diferentes. Uma descrição “Bad Request” não autoriza escolher um deles.
3. Se houver `invalid_grant`, conferir revogação/expiração e políticas. Modo Testing externo pode expirar refresh tokens após sete dias; a cronologia sozinha não comprova esse cenário. Não mudar Audience automaticamente.
4. Se for necessário novo consentimento, o operador usa o fluxo oficial do mesmo cliente com acesso offline. Não enviar client secret, código ou refresh token por chat, repositório, relatório ou serviços de terceiros.
5. Qualquer substituição de secret requer autorização específica do operador. Não rotacionar client secret nem mudar developer token/MCC por tentativa. A mudança pode fazer o cron retomar escritas regulares na execução seguinte; isso deve ser explicitado na aprovação.
6. Após a correção autorizada, executar um dry run: conferir OAuth, conta configurada, campanhas, sete domínios e métricas. Uma resposta válida do Google Ads confirma também developer token/acesso usados naquela consulta. Só então autorizar o backfill.

## Plano de backfill

São **28 dias completos**, divididos em quatro lotes:

1. 28/09–04/10.
2. 05/10–11/10.
3. 12/10–18/10.
4. 19/10–25/10.

26/10 é dia parcial, separado no plano para eventual consulta sem gravação. Não o tratar como dia completo. Na execução futura, refazer a cobertura e calcular o plano com a data vigente; aprovar o novo hash e os intervalos exatos. A automação pode ter recuperado parte do intervalo após a correção.

O inventário privado, IDs de conta, plano e hash ficam em `artifacts/`, ignorado pelo Git. Não registrar identidades pessoais ou secrets. O planejador exige cobertura de todos os sete domínios por conta; não presume que domínio vazio é zero.

```text
node scripts/google-ads-recovery.mjs plan INPUT_COVERAGE.json OUTPUT_PLAN.json
node scripts/google-ads-recovery.mjs dry-run OUTPUT_PLAN.json OUTPUT_DRY_RUN.json
```

O executor recebe `SUPABASE_URL` e `SUPABASE_SECRET_KEY` somente pelo ambiente seguro do operador/backend. Nunca passar secrets como argumento de linha de comando. Ele verifica host exato, cliente, contas, versão do contrato, datas e contagens. Faz todos os preflights antes da primeira escrita, opera sequencialmente e grava recibos sanitizados em arquivo novo.

**O comando seguinte não foi executado em produção e exige aprovação separada do plano exato:**

```text
node scripts/google-ads-recovery.mjs write OUTPUT_PLAN.json OUTPUT_WRITE.json APPROVED_PLAN_SHA256
```

Não chamar o coordenador para um dry run: ele solicita escrita. O executor chama somente `sync-google-ads`, nunca Meta Ads/GA4. Antes da escrita, conferir que não há execução Google Ads ativa e reservar uma janela longe de 01:00 de São Paulo. Este PR não introduz trava global entre cron e recuperação: respeitar a janela operacional e não executar dois operadores simultaneamente. Não alterar nem desabilitar o cron sem autorização.

### Idempotência e falhas

As chaves determinísticas do coletor incluem namespace, cliente, período e hash do payload normalizado. Payload idêntico retorna `already_processed`. Payload atualizado usa as constraints naturais e substitui valores; não soma investimento nem conversões.

As chaves naturais incluem cliente, fonte, conta, entidade e data. Keywords incluem também grupo de anúncios; recursos PMax incluem grupo de recursos e field_type. Não somar as métricas dos sete domínios entre si: são níveis diferentes do mesmo gasto.

Os cinco RPCs não constituem uma transação única. Falha parcial interrompe o executor; conservar os recibos e conferir quais domínios concluíram. Reprocessar somente após verificar o estado efetivo e obter aprovação correspondente. Em perda de resposta, o estado de escrita é indeterminado: não repetir automaticamente, não assumir rollback e não excluir linhas para tentar novamente.

Ao final, reconciliar conta, datas, chaves únicas, contagens e somas por domínio com o dry run/API, preservando histórico anterior. Ausência legítima de atividade não deve gerar zeros artificiais nem exclusão de histórico. Recarregar o dashboard apenas depois de confirmar a persistência.

## Validação

Testes de funções: OAuth e códigos seguros, erros de transporte/JSON, SearchStream, credenciais não expostas, coleta/normalização dos sete domínios, dry run sem RPC, conta divergente e escrita parcial. Testes do executor: plano, integridade, destino/conta, preflight, interrupção e ausência de retries. PostgreSQL local: as mesmas quatro definições de RPC lidas de produção, dados sintéticos, sete tabelas, 43 verificações de idempotência/atualização/preservação e rejeição de data fora do intervalo.

O teste PostgreSQL usa somente `127.0.0.1:55437/google_ads_recovery_test`, exige banco vazio e recusa destino diferente. Não executa migrations em Supabase. O runtime Auth/Edge real e a coleta Google real após a correção ainda dependem da intervenção e publicação autorizadas; testes simulados não substituem essa confirmação.

Resultados locais: 73 testes distintos de funções (54 existentes e 19 de recuperação), 20 testes do executor, 39 testes dos contratos comerciais/importação preservados e 43 verificações PostgreSQL aprovados. TypeScript, Deno das duas funções, builds Pages/Sites e 4 testes de empacotamento Sites aprovados. O teste Sites inicialmente foi chamado após o build Pages e faltou o arquivo de servidor; executado com o build Sites correto, passou sem alteração de código. Aviso conhecido de chunks maiores que 500 kB permanece não bloqueante.

## Referências

- [OAuth: obtenção e renovação de tokens](https://developers.google.com/identity/protocols/oauth2/web-server).
- [OAuth: expiração, Testing e políticas de sessão](https://developers.google.com/identity/protocols/oauth2#expiration).
- [Google Ads: OAuth, developer token e login-customer-id](https://developers.google.com/google-ads/api/rest/auth).
- [Supabase: logs de Edge Functions](https://supabase.com/docs/guides/functions/logging).
