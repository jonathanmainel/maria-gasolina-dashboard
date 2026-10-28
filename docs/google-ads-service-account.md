# Google Ads — Service Account e ativação controlada

Estado verificado em **27/10/2026**. Branch `codex/google-ads-service-account`, separada do PR #7. Sem merge, deploy ou backfill nesta execução.

## Identidade e acesso

- Projeto Cloud `thermal-apricot-508813-q7`; Supabase `hlqrpreqvvxtkruwsolg`.
- Identidade criada: `maria-gasolina-google-ads@thermal-apricot-508813-q7.iam.gserviceaccount.com`.
- Acesso **Somente leitura**, direto à Maria Gasolina Express `6072699813`, sem acesso concedido ao MCC GT+ `5958313391` ou papéis IAM administrativos.
- Google Ads API habilitada; projeto com acesso Explorer para produção. Consulta real confirmou acesso sem `login-customer-id`.
- Chave existente fora do repositório, em pasta privada com ACL restrita ao operador e SYSTEM. Nenhuma nova chave foi criada nesta etapa.

Developer Tokens são opcionais e ignorados desde **09/09/2026**, conforme a [política oficial](https://developers.google.com/google-ads/api/docs/api-policy/developer-token). O coletor deixa de exigir, ler ou enviar o token legado em ambos os modos. O acesso depende do projeto Cloud e da autorização da identidade na conta Ads. O secret antigo foi preservado.

## Configuração backend

| Nome | Estado e função |
|---|---|
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | Criado após autorização específica. Digest remoto confere com o JSON privado; todos os secrets preexistentes mantiveram seus digests. Cópia transitória removida. |
| `GOOGLE_ADS_AUTH_MODE` | Próximo lote autorizado: `service_account`. Ausente mantém `oauth`, evitando troca implícita ao publicar. |
| `GOOGLE_ADS_WRITES_ENABLED` | Nova versão bloqueia escrita salvo valor literal `true`. Publicação inicial deve usar `false`. |
| `GOOGLE_ADS_SERVICE_ACCOUNT_LOGIN_CUSTOMER_ID` | Ausente para o acesso direto confirmado. Não herda o MCC legado. |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Preservado; usado exclusivamente em OAuth. |
| `GOOGLE_ADS_API_VERSION` | Configuração preservada; fallback `v25`. |

Client ID, client secret, refresh token e demais secrets antigos foram preservados. A leitura final informa a função publicada na **versão 4**, ainda com OAuth antigo; seu handler e módulo Google Ads coincidem com a main, sem o autenticador Service Account. Criar o novo secret não a migra. Os números de versão também aumentaram nas outras funções; isso, isoladamente, não comprova publicação de código. O bundle Meta mantém o mesmo hash previamente validado.

O backend assina JWT RS256 com escopo `https://www.googleapis.com/auth/adwords`, validade de uma hora e endpoint fixo `https://oauth2.googleapis.com/token`, sem `sub`, impersonação ou delegação. Access token somente em memória, compartilhado entre consultas da invocação e renovado com margem de 60 segundos; HTTP 401 permite uma renovação. Sem fallback automático de identidade. Erros expõem apenas status e códigos permitidos, sem corpo bruto ou credenciais.

A assinatura usa WebCrypto do runtime existente, sem infraestrutura adicional. GAQL, métricas, normalização, persistência, idempotência e agendamento conservam o comportamento anterior.

## Testes concluídos

**56 testes locais aprovados**: assinatura/claims, renovação, falhas seguras, token ausente ou legado ignorado, separação do MCC, bloqueio de escrita, dry run e idempotência simulada. Alias de testes corrigido para caminhos Windows. `deno check` passou para handler e preflight com dependências oficiais em cache; sem mudança dos manifestos de produção.

O preflight executou o handler local real contra Google Ads e leituras do Supabase de produção. Token emitido, customer confirmado e ambos os dry runs com HTTP 200, `ok=true` e `database_write_performed=false`:

| Dia | Impressões atuais da API | Cliques | Conversões | Custo retornado |
|---|---:|---:|---:|---:|
| 27/09 | 1.163 | 57 | 6 | 116,174254 |
| 25/10 | 518 | 36 | 6 | 96,078925 |

O snapshot persistido de 27/09 tem 1.162 impressões, 57 cliques, 5 conversões e custo 116,174254. Custo e cliques coincidem; a API atual retorna uma impressão e uma conversão a mais. A causa histórica não foi comprovada. Em 25/10 não há linha Google Ads persistida. Nada foi criado ou atualizado.

O preflight permite apenas OAuth, `searchStream` da conta alvo e GETs de três tabelas de configuração/comparação; bloqueia RPCs e demais requisições. Recibo: 17 consultas Ads, 9 leituras Supabase, 3 trocas de token, **zero tentativas de escrita**; snapshots diários e `updated_at` iguais antes/depois. Isso valida integração real do código local, **não o runtime publicado**.

`scripts/google-ads-sa-readonly.ts` contém o preflight; `scripts/google-ads-sa-operator.py` captura credenciais em memória e exporta somente recibos sanitizados para `artifacts/`, ignorado pelo Git. O provisionamento recusa sobrescrever secret existente e exige autorização própria. A cópia privada original será removida após validar o runtime publicado e encerrar a necessidade local; apagar arquivo não garante apagamento físico em SSD. Rotação/revogação exige autorização específica.

## Próximo lote — publicação sem escrita, exige autorização

1. Conferir novamente versão publicada e configurações relevantes; preservar versão anterior para reversão.
2. Configurar somente `GOOGLE_ADS_AUTH_MODE=service_account` e `GOOGLE_ADS_WRITES_ENABLED=false`. Manter ausente o login específico de SA e não sobrescrever o JSON.
3. Publicar **somente** `sync-google-ads`, mantendo `withSupabase({ auth: "secret" })` e a autenticação de gateway existente. Sem publicar outras funções, migrations ou dashboard; sem merge neste lote.
4. Chamar diretamente a função publicada para 27/09 e 25/10, com `dry_run=true` e credencial backend em memória. Não usar coordenador ou `pg_net`, que podem gravar auditoria e chamar outras fontes.
5. Exigir HTTP 200, `ok=true`, modo `dry_run`, autenticação `service_account`, conta correta, métricas esperadas e `database_write_performed=false`. Comparar linhas e `updated_at`; confirmar bloqueio de pedidos de escrita antes de consultas externas/persistência.
6. Após essa validação, pedir **autorização separada** para `GOOGLE_ADS_WRITES_ENABLED=true`. Enquanto bloqueado, o cron poderá registrar HTTP 409 apenas no ramo Google Ads. Não alterar Meta ou GA4.
7. Depois da ativação autorizada, confirmar execução diária e dados realmente persistidos. Token e dry run não comprovam retomada do cron.

Reversão: bloquear gravações e revisar configuração/versão anterior antes da ação autorizada. Selecionar OAuth não revalida o Refresh Token com `invalid_grant`.

## Backfill separado

Consulta atual confirmou sete domínios com última data **27/09**, zero linhas de **28/09–26/10**, exclusivamente para `6072699813`. Plano atualizado: [29 dias, execução diária sequencial](google-ads-backfill-20261027.md). Sem dependência do PR #7. Antes da autorização de ingestão, repetir dry runs por dia e atualizar a cobertura, pois o cron poderá preencher parte da lacuna depois da ativação.

Nenhuma alteração de Meta, GA4, RLS, OAuth/Branding, Cloud Run, permissões comerciais, dashboard publicado ou cron nesta execução. Investigação Meta registrada separadamente.

Referências: [Developer Token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [Service Accounts](https://developers.google.com/google-ads/api/docs/oauth/service-accounts), [secrets de Edge Functions](https://supabase.com/docs/guides/functions/secrets).

