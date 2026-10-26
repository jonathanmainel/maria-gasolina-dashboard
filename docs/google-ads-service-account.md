# Google Ads: migração para Service Account com acesso direto

## Estado desta preparação

- Base: `origin/main` em `1168f9f`. Branch: `codex/google-ads-service-account`; não incorpora o PR #7.
- Projeto Google Cloud: `thermal-apricot-508813-q7`; Supabase: `hlqrpreqvvxtkruwsolg`; função: `sync-google-ads`.
- Conta alvo informada: `6072699813`. A migration registra Maria Gasolina, mas nome, moeda, fuso e hierarquia ainda precisam ser confirmados no Google Ads real.
- Identidade proposta, **ainda não inventariada nem criada**: `maria-gasolina-google-ads@thermal-apricot-508813-q7.iam.gserviceaccount.com`.
- Não há conectores Google Cloud/Google Ads/Supabase nesta sessão. O CLI gcloud não está instalado; não há autenticação Supabase utilizável. A configuração ADC disponível não identifica o projeto solicitado e não foi utilizada como credencial dele.
- Developer Token: origem no MCP, armazenamento, proprietário, nível e autorização em produção **não verificados**. Ausência na máquina local não prova ausência no Supabase. Não houve extração de tokens do MCP nem criação de token substituto.
- Git por HTTPS funciona. GitHub REST e GraphQL retornam 403, inclusive fora do sandbox; criação do PR depende de acesso à API.
- Nenhuma identidade, chave, permissão, secret, função publicada, cron ou dado de produção foi alterado. Nenhum backfill foi executado.

## 1. Inventário e aprovação da identidade

Em uma sessão Google Cloud autorizada, realizar somente leitura primeiro:

```sh
gcloud iam service-accounts list \
  --project=thermal-apricot-508813-q7 \
  --format='table(email,displayName,disabled)'
```

Revisar todas as identidades para detectar uma equivalente, inclusive com outro nome. Preferir identidade dedicada a Google Ads; não reutilizar a do GA4 automaticamente. Registrar apenas e-mail e estado, nunca credenciais.

Se não existir equivalente, **solicitar autorização explícita antes de executar**:

```sh
gcloud iam service-accounts create maria-gasolina-google-ads \
  --project=thermal-apricot-508813-q7 \
  --display-name='Maria Gasolina - leitura Google Ads'
```

A identidade não precisa de papéis administrativos no projeto para obter acesso ao Ads. Não habilitar delegação de domínio nem usar `sub`/impersonação. Se a organização proibir chaves de Service Account, não contornar a política: reavaliar a emissão de credenciais antes da implantação. Esta implementação utiliza chave PKCS#8, não implementa federação de identidade.

## 2. Acesso à conta e Developer Token: pré-requisitos de implantação

1. Confirmar no Google Ads que `607-269-9813` é Maria Gasolina; registrar nome, moeda, fuso e contas administradoras existentes.
2. Preferir conceder **Somente leitura** ao e-mail confirmado da Service Account diretamente em **Acesso e segurança** da conta. Conceder novo acesso depende de autorização do usuário/administrador. Não modificar usuários existentes.
3. Se o acesso direto não for permitido, usar o MCC já vinculado e confirmar que a identidade tem acesso efetivo à conta filha. Registrar o ID do MCC para `GOOGLE_ADS_LOGIN_CUSTOMER_ID`. Não criar vínculos novos por suposição. Conceder acesso no MCC amplia o alcance da identidade; preferir a conta alvo quando possível.
4. Consultar apenas os nomes dos secrets existentes no Supabase e confirmar a presença de `GOOGLE_ADS_DEVELOPER_TOKEN`, sem imprimir seu valor. Verificar metadados de configuração do MCP quando a conexão estiver disponível. O token gerenciado por um provedor MCP pode não ser uma credencial transferível ao coletor; não extraí-lo nem substituí-lo por um placeholder.
5. No API Center do MCC proprietário do token, confirmar proprietário e nível autorizado para contas de produção, limites e eventuais restrições. Um token exclusivo para contas de teste não serve à conta real. O MCC proprietário do developer token não precisa ser o mesmo `login-customer-id`; este último descreve o caminho de autorização da Service Account.
6. Reutilizar o token existente somente se seu uso nesta integração for autorizado. Uma troca OAuth bem-sucedida não valida o developer token: a consulta GAQL autenticada também deve passar.

**Sem confirmar esses requisitos, não implantar nem afirmar que o token foi validado.** Não pedir valores de credenciais pelo chat.

## 3. Secrets e configuração de backend

Configurar somente após autorização, no projeto Supabase correto:

| Nome | Uso |
| --- | --- |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | Novo secret: JSON original da identidade autorizada, com `type`, `client_email` e `private_key`. Assinatura ocorre no backend. |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Reutilizar o secret existente após validá-lo; obrigatório em ambos os modos. |
| `GOOGLE_ADS_AUTH_MODE` | Configuração: `service_account` (padrão). `oauth` somente para reversão explícita. |
| `GOOGLE_ADS_WRITES_ENABLED` | Configuração: inicialmente `false` ou ausente. Somente `true` libera gravações após aprovação. |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Opcional: MCC de dez dígitos quando esse for o caminho efetivo. No acesso direto, remover uma configuração antiga de MCC se ela não for aplicável, após revisão. |
| `GOOGLE_ADS_API_VERSION` | Preservar a versão existente; padrão atual `v25`. Confirmar suporte na consulta real. |

Manter temporariamente `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_REFRESH_TOKEN` sem renová-los. No modo Service Account, eles nem são lidos. A reversão não torna válido o refresh token já identificado como `invalid_grant`.

Emitir chave somente com autorização específica; uma identidade reutilizada não implica autorização para emitir outra chave. Transferir diretamente pelo fluxo seguro do operador ao secret Supabase. Nunca adicionar JSON privado a checkout, `.env` do frontend, anexos, chat, saída de terminal ou CI. Qualquer arquivo transitório de provisionamento deve ficar fora do checkout, com acesso restrito, e ser eliminado após a transferência; armazenamento permanente somente no backend autorizado. Não desabilitar políticas da organização.

Rotação futura: emitir nova chave autorizada, atualizar somente o secret do Ads, validar token/GAQL/dry run com gravações bloqueadas e então revogar a chave antiga após encerrar invocações em andamento. Registrar apenas identificadores e datas de chaves. Em suspeita de exposição, revogar imediatamente e bloquear gravações até nova validação. Não alterar a credencial do GA4.

## 4. Comportamento implementado

- JWT RS256 com `iss` da Service Account, escopo `https://www.googleapis.com/auth/adwords`, `aud=https://oauth2.googleapis.com/token`, validade de uma hora, sem `sub`.
- Troca `urn:ietf:params:oauth:grant-type:jwt-bearer` no endpoint fixo; token URI alternativo rejeitado.
- Access token somente em memória por invocação. Consultas concorrentes compartilham a troca; renovação automática com margem de 60 segundos e uma nova tentativa de token em HTTP 401. HTTP 403 não provoca repetição ou mudança de identidade.
- Sem fallback automático para OAuth pessoal. Reversão requer `GOOGLE_ADS_AUTH_MODE=oauth` e as credenciais antigas completas.
- Developer Token obrigatório; redirecionamentos rejeitados; timeouts definidos. Erros externos expõem somente HTTP e códigos de uma lista controlada, sem corpo bruto, JWT, token ou chave.
- GAQL, normalização, oito relatórios (incluindo metadados PMax), RPCs, chaves de idempotência e histórico preservados.
- `dry_run=true` faz leituras de configuração no banco e consultas no Google, sem executar RPCs de persistência. O bloqueio de gravação também impede que o cron existente escreva antes da aprovação.

## 5. Validação e publicação em etapas

Testes locais, sem credenciais reais, no diretório raiz:

```sh
node node_modules/vitest/vitest.mjs run --config supabase/functions/sync-google-ads/vitest.config.ts
npm run typecheck
npm test
npm run build
npm run test:sites
```

A suíte dedicada usa WebCrypto real com chave sintética gerada em memória e rede/banco simulados. O wrapper de autenticação Supabase é substituído apenas nos testes; não há bypass em produção nem alegação de homologação de auth/RLS por essa suíte. Ela verifica assinatura, claims, renovação, erros sem vazamento, MCC, consultas, dry run sem chamadas de escrita, bloqueio de cron e idempotência com banco simulado. Não substitui comparação de métricas reais.

Resultados locais: 51 testes em quatro arquivos na suíte dedicada (inclui regressões do agendador); 598 testes da aplicação em 51 arquivos; TypeScript; build de produção; quatro testes Sites aprovados. Build mantém o aviso existente de chunks maiores que 500 kB. GAQL, normalização/hashing e bloco original de persistência/idempotência foram comparados com a main e permanecem idênticos.

`deno check` dos módulos `auth.ts` e `google-ads.ts` passou sem overrides. O check do handler com a configuração original foi bloqueado ao buscar o pacote em `jsr.io`. O handler completo passou com um import map temporário usando as declarações oficiais de Edge Runtime já instaladas via npm, `@supabase/server@1.9.2` e a dependência de tipos `openai@4.52.5`; nenhum manifesto/lockfile do projeto foi alterado. Repetir a resolução original de JSR em ambiente com acesso antes da publicação; os testes simulados não validam resolução/deploy remoto. Dry run real, Developer Token, hierarquia, comparação histórica e cron remoto seguem pendentes.

Antes de publicar: revisar/autorizar separadamente criação da identidade (se necessária), acesso Ads, emissão de chave, atualização dos secrets e deploy. Revisar o PR específico; não fazer merge do PR #7 como dependência. Como o coletor não foi alterado na main, seu estado publicado permanece estável até deploy autorizado.

1. Confirmar os pré-requisitos reais das seções 1–2 e revisar versão anterior da função para reversão.
2. Após autorização para atualizar secrets, configurar Service Account e token existente; deixar `GOOGLE_ADS_WRITES_ENABLED=false`. Atualizar secrets não é autorização para publicar código.
3. Após autorização separada, publicar **somente** `sync-google-ads` no projeto `hlqrpreqvvxtkruwsolg`. Não publicar todas as funções nem executar migrations. Manter `withSupabase({ auth: "secret" })` e a configuração de autenticação de gateway já utilizada; não alterar JWT do projeto por suposição.
4. Chamar a função diretamente com autenticação administrativa suportada, via ferramenta backend autorizada. Não usar o coordenador `sync-dashboard-daily`, que grava auditoria e chama outras integrações; não usar `pg_net` para alegar ausência total de escrita.
5. Primeiro corpo de validação histórica, sem credenciais no corpo:

```json
{"client_slug":"maria-gasolina","start_date":"2026-09-27","end_date":"2026-09-27","dry_run":true}
```

6. Exigir HTTP 200, `ok=true`, `auth_mode=service_account`, conta `6072699813`, developer token configurado, campanhas/métricas esperadas e `database_write_performed=false`. Um HTTP 200 sem dados não comprova disponibilidade das métricas; conferir com o Ads. Comparar impressões, cliques, custo e conversões com banco/Google Ads no mesmo fuso, moeda e modelo de atribuição. Investigar divergências; conversões podem ser reatribuídas após a coleta original. Não comparar conversões Ads com `form_submit` do GA4.
7. Repetir dry run para um único dia completo recente. Confirmar por leitura que linhas e `updated_at` do recorte não mudaram. Logs de plataforma podem existir; a garantia do coletor é ausência de persistência de dados no banco nesse caminho.
8. Obter aprovação explícita para habilitar `GOOGLE_ADS_WRITES_ENABLED=true` e retomar as gravações diárias. Enquanto estiver bloqueado, o cron pode registrar falha HTTP 409 apenas para Google Ads; Meta e GA4 continuam com seus fluxos existentes.
9. Confirmar por leitura `cron.job` e `dashboard_source_accounts`: migration existente agenda `google-ads-daily-sync` em `0 4 * * *` (01h em São Paulo), com Google Ads ativo/automatizado para Maria Gasolina. Nenhum arquivo de agendamento foi alterado; o estado remoto ainda precisa ser conferido. O coordenador consulta os últimos sete dias completos; isso não recupera sozinho toda a lacuna desde setembro.
10. Após uma execução diária autorizada, verificar `dashboard_automation_runs` para `source=google_ads`, status, intervalo e contagens, e a data realmente persistida. Não declarar coleta restaurada apenas porque houve obtenção de token.

## 6. Recuperação histórica preparada, não executada

Após sucesso da autenticação, levantar a cobertura diária de todos os domínios para Maria Gasolina/Google Ads/conta `6072699813`. Confirmar a última data real; 27/09/2026 é a referência informada, não uma consulta atual nesta sessão.

Planejar desde **28/09/2026 até a data efetiva de recuperação**, incluindo o próprio dia da recuperação somente depois de completo no fuso da conta. Não fixar o fim em 26/10 se a restauração ocorrer depois. Reconciliar primeiro os dry runs por dia/conta/domínio; relatório com datas, contagens e totais antes de solicitar autorização específica para backfill.

Com essa autorização e gravações habilitadas, executar exclusivamente `sync-google-ads`, um dia por vez, sem alterar o coordenador. Usar as RPCs/upserts e as chaves de idempotência existentes; não truncar, apagar, inserir em massa por SQL ou reescrever métricas manualmente. Repetição do mesmo payload deve retornar `already_processed`; dados corrigidos pelo Google podem gerar hash novo e upsert nas mesmas chaves naturais. Parar em qualquer falha ou sucesso parcial, reconciliar e repetir apenas o dia necessário. Registrar intervalos efetivos e conferir todos os domínios, inclusive PMax, antes de avançar. Não disparar a coleta Meta/GA4 durante essa operação.

Reversão controlada: bloquear gravações, revisar e autorizar a restauração da versão anterior ou selecionar explicitamente `oauth`. O refresh token inválido continua inválido; essa reversão restaura comportamento/configuração anterior, não garante coleta funcional. Não renovar tokens pessoais como parte desta migração.

## Referências

- [Service Accounts no Google Ads](https://developers.google.com/google-ads/api/docs/oauth/service-accounts).
- [Configuração oficial Python: acesso direto sem impersonação; Developer Token obrigatório](https://github.com/googleads/google-ads-python/blob/main/google-ads.yaml).
- [Implementação oficial de autenticação](https://github.com/googleads/google-ads-python/blob/main/google/ads/googleads/oauth2.py).
