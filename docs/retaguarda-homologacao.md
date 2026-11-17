# Homologação técnica da Retaguarda

## Compatibilidade e correções

- A verificação somente leitura de produção confirmou o constraint `viewer/editor/admin`, a chave de contas `(client_id, source, account_id)`, os contratos de associação e a ausência da tabela financeira. A migration financeira usa `private.is_dashboard_client_member` para leitura. A inclusão testa a associação do usuário autenticado e os papéis `editor/admin`, a mesma condição operacional de `private.dashboard_manual_has_role`. A existência de `manager` na migration-base do repositório é uma divergência histórica. O esquema de produção já aceita Editor. O ajuste de paridade para o ensaio fica em um fixture local e fora das migrations.
- A RPC pública de contas roda com permissões do chamador. A projeção privilegiada fica no esquema privado, com caminho de busca vazio, escopo de cliente verificado e execução concedida a `authenticated`. A tabela financeira tem grants explícitos por operação e coluna e políticas de leitura e inclusão. As chaves estrangeiras ligam cliente, plataforma, conta e versão anterior. As restrições de unicidade e o gatilho de imutabilidade sustentam o histórico.
- O envio agora verifica a identidade da sessão antes da escrita e usa o mesmo token para escrever ou conferir um envio de resposta perdida. O cliente distingue sessão expirada, falta de permissão, chave reutilizada com conteúdo diferente e conflito de versão. A data e os dois valores também precisam coincidir para recuperar o sucesso de um envio pela chave.

## Critério de vigência

A versão vigente de uma conta e data é a que ainda não tem sucessora. Para cada conta ativa, os cards usam a data operacional mais recente do intervalo selecionado. Cada total de plataforma exige o respectivo valor em todas as contas ativas e na mesma data. Uma conta desativada permanece no histórico e fica fora dos totais. A data de referência é operacional e a interface formata horários de medição e gravação em `America/Sao_Paulo`. Um valor registrado de zero compõe a cobertura. Um campo ausente não compõe.

## Matriz de evidências

O ensaio usou a pilha nativa da CLI Supabase 3.2.0 no WSL, em projeto descartável sem link remoto. A pilha rodou PostgreSQL 17.12, Auth 2.198.0 e PostgREST 16.5. O Docker Desktop voltou a responder durante o ensaio. A validação prosseguiu no WSL já preparado.

| Requisito | Status | Evidência |
| --- | --- | --- |
| Compatibilidade da migration com papéis, associações, contas, grants, RLS, caminho de busca e gatilho | Validado | Comparação somente leitura com o esquema remoto, instalação da migration e suíte SQL no PostgreSQL local. |
| Admin lê, cadastra e corrige. Sobrescrita direta é bloqueada. | Validado | Requisições autenticadas à API local e leitura das versões preservadas. |
| Editor lê, cadastra e corrige. Escrita em outro cliente é bloqueada. | Validado | API local e formulário no Chrome, com sessão emitida pelo Auth local. |
| Viewer lê. Cadastro, correção, exclusão e promoção são bloqueados. | Validado | API local e botões indisponíveis no ensaio de interface. |
| Externo fica isolado e não consegue forjar autoria ou elevar permissões. | Validado | Consultas ao cliente alheio retornaram vazio. Gravações e alteração de papel foram recusadas ou afetaram zero linhas. |
| Anônimo não lê, grava ou usa a RPC de contas. | Validado | API local com chave anônima e sem sessão de usuário. |
| Correção concorrente mantém uma versão vigente e comunica o conflito. | Validado | Duas requisições simultâneas à API real. Exatamente uma sucedeu a versão original. Mensagem conferida com resposta de conflito controlada no Chrome. |
| Duplo clique, resposta perdida, reenvio e reutilização de chave | Validado | Chrome com interrupção controlada após salvar. PostgREST real recusou a repetição da chave com o mesmo conteúdo e com conteúdo diferente. Teste unitário cobriu a confirmação apenas por autoria e conteúdo exatos. |
| Reprocessamento de importação e correção legítima de registro importado | Validado | Requisições reais com entradas sintéticas, chave de origem e referência à versão anterior. |
| Precisão, zero, ausências, inválidos, datas anteriores e horário de São Paulo | Validado | API e SQL para integridade. Formatação testada na troca de dia entre UTC e São Paulo. |
| Duas contas por plataforma, conta desativada, ausência, datas distintas e correção isolada | Validado | Cadastro e leitura de contas na API local. Resumo, filtros e correção de uma conta na interface. |
| Formulário autenticado, persistência, cards e histórico após salvar e corrigir | Validado | Chrome com sessão local real e requisições ao PostgREST, sem interceptar as respostas. |
| Erros de rede, expiração durante a gravação, permissão, carregamento, filtros e temas | Validado | Testes de interface com respostas controladas em desktop, tablet e celular nos dois temas. |
| Rejeição de sessão expirada pela API | Validado | O PostgREST real respondeu HTTP 401 ao token emitido pelo Auth local depois da expiração e da tolerância de relógio. |
| Regressões e carregamento sob demanda | Validado | 683 testes unitários em 60 arquivos e teste de rede que confirma ausência do arquivo e das consultas financeiras na aba Site. |
| TypeScript, SQL, navegador e build de produção | Validado | Comandos locais concluídos, incluindo 18 cenários Playwright. |
| Google OAuth, execução remota e publicação | Não testado | O login usou usuários sintéticos por senha na pilha local. A etapa remota continua pendente. |

## Reprodução local

1. Prepare um Supabase descartável com Auth, PostgREST e PostgreSQL 17 em loopback. O runtime nativo da CLI pode ser usado no WSL. Use uma pasta de trabalho e um diretório de estado próprios para o ensaio.
2. Reproduza a estrutura-base a partir de `20260909024415_create_dashboard_ingestion_schema.sql`, `20260909025150_harden_dashboard_membership_helper.sql` e o trecho de definição de tabela da `20260923024640_add_dashboard_source_accounts.sql`. Use apenas o DDL da última para evitar carregar as contas de exemplo da implantação. Carregue `20261117045349_retaguarda_financial_entries.sql` e aplique `tests/homolog/retaguarda-local-baseline.sql` por conexão TCP de loopback, em banco Auth vazio.
3. Execute `supabase/tests/retaguarda_financial_entries.test.sql` com `ON_ERROR_STOP`. O bloco termina em rollback e deve retornar `ok 1`.
4. Informe ao teste `RETAGUARDA_LOCAL_URL`, `RETAGUARDA_LOCAL_DB_URL`, `RETAGUARDA_LOCAL_PSQL`, `RETAGUARDA_LOCAL_ANON_KEY` e `RETAGUARDA_LOCAL_SERVICE_KEY` do projeto descartável. As chaves ficam apenas no processo de teste. Execute `node tests/homolog/retaguarda-local.integration.mjs`. O teste recusa URLs fora de loopback e exige o marcador do banco sintético antes de criar usuários.
5. Para testar a expiração real, use JWT local de até 120 segundos e configure `RETAGUARDA_TEST_WAIT_EXPIRY=1`. Para testar o formulário contra a pilha real, informe também `RETAGUARDA_LOCAL_APP_URL` do frontend local compilado com a URL e a chave pública do mesmo projeto descartável. O navegador recebe uma sessão emitida pelo Auth local via login por senha. A tela de login Google fica fora desse ensaio.
6. Rode `npm run typecheck`, `npm test`, `npm run test:e2e -- --config playwright.retaguarda.config.ts` e `npm run build`. A suíte Playwright dedicada usa respostas controladas para falhas de rede, expiração durante a gravação, filtros e larguras de tela.

## Checklist para uma futura publicação

### Antes da publicação

- [ ] Confirmar autorização, projeto de destino, janela de mudança e responsáveis pelo banco e pelo frontend.
- [ ] Marcar o Draft PR como pronto quando autorizado e obter aprovação após a revisão técnica e a validação das etapas locais.
- [ ] Confirmar as variáveis de ambiente do frontend e os redirecionamentos autorizados do Google OAuth. O frontend usa somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para a conexão.
- [ ] Comparar o histórico de migrations publicado com o repositório. Revisar o DDL da Retaguarda isoladamente e listar qualquer migration anterior inesperada antes de decidir o conjunto de aplicação.
- [ ] Confirmar o constraint de papéis, as chaves de clientes e contas, os contratos das funções de associação, o esquema `public` na Data API e a ausência de uma tabela financeira com definição conflitante.
- [ ] Conferir os vínculos dos usuários autorizados e identificar os responsáveis pelos testes com Editor, Admin e Viewer. Aprovar o valor operacional que será usado no primeiro teste de escrita.
- [ ] Verificar backup recuperável e ensaiar a restauração fora de produção. Registrar a cobertura e os totais de referência das tabelas de campanhas, GA4 e configurações em um período fechado, com o mesmo cliente e filtros nos dois lados da conferência.

### Durante a publicação

- [ ] Aplicar somente a migration financeira em transação, na ordem descrita abaixo. Conferir o esquema, as permissões e o cache de schema do PostgREST antes de publicar o frontend. Verificar que a chave do frontend é pública e que a função privada não está exposta como endpoint.
- [ ] Conferir leitura e ausência de exposição usando os perfis autorizados. Validar isolamento de cliente, Viewer e anônimo antes de liberar novas gravações.
- [ ] Publicar o frontend após o banco e a API responderem como esperado. O push em `main` aciona o workflow de GitHub Pages. Na janela autorizada, faça o merge somente depois das verificações do banco.

### Depois da publicação

- [ ] Testar login com Google OAuth real, abrir a Retaguarda e conferir os indicadores do Google Ads, Meta Ads e GA4 no período fechado de referência.
- [ ] Cadastrar o primeiro registro financeiro autorizado. Consultar o lançamento e validar autoria, conta e horários. Validar a correção e a leitura de ambas as versões com um lançamento operacional cuja correção tenha sido autorizada.
- [ ] Conferir acesso somente leitura, navegação e filtros. Repetir os testes de fumaça nas páginas anteriores e comparar cobertura e totais dos dados no mesmo intervalo de referência.
- [ ] Se a liberação falhar, restaurar a versão anterior do frontend e suspender a permissão de inclusão financeira em alteração revisada, se necessário. Preservar a tabela e as versões que já tenham sido registradas. Reexecutar os smoke tests antes de reabrir a escrita.

### Ordem e histórico da migration

A revisão somente leitura de 17/11/2026 encontrou PostgreSQL 17.6, a chave única exigida de contas, o constraint `viewer/editor/admin` e os grants de associação necessários. A tabela e as funções da Retaguarda ainda estão ausentes. A versão `20261117045349` ainda não consta no histórico publicado.

Seis nomes de migrations anteriores aparecem com versões diferentes. A comparação de nomes identifica a divergência, mas a equivalência do DDL antigo exige revisão própria.

| Migration | Git | Supabase |
| --- | --- | --- |
| dashboard_manual_sync | 20261027200303 | 20261028053319 |
| meta_preview_reservation_protocol | 20261028181122 | 20261029171157 |
| meta_preview_receipt_validation | 20261028185400 | 20261029171241 |
| meta_preview_status_compatibility | 20261028185700 | 20261029171307 |
| meta_preview_restored_previous_receipt | 20261029203211 | 20261030122336 |
| meta_preview_receipt_restore_provenance | 20261101125133 | 20261101133901 |

1. Revalide o histórico, os objetos, o backup e o SHA aprovado. Bloqueie o `db push` do diretório inteiro enquanto a divergência existir.
2. Se a divergência continuar na janela de publicação, use o procedimento aprovado para aplicar **somente** `20261117045349_retaguarda_financial_entries.sql`. Pode-se executar o arquivo via `psql --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/20261117045349_retaguarda_financial_entries.sql`, usando uma conexão autenticada do projeto confirmado. Use o arquivo do commit aprovado. Se o esquema e o histórico já tiverem sido reconciliados, confirme primeiro que a prévia da ferramenta de migrations contém apenas a versão esperada.
3. Após o commit do DDL, confirme tabela, chave de conta e predecessora, índices únicos, gatilho de imutabilidade, RLS habilitada, grants por coluna e RPC de contas. Consulte o PostgREST autenticado. Se o schema ainda não estiver reconhecido, verifique a configuração e recarregue o cache antes de seguir.
4. Se a aplicação tiver sido manual, registre a versão no histórico aprovado **somente após** verificar o esquema. O comando `supabase migration repair 20261117045349 --status applied --linked` registra a versão e exige que o vínculo aponte ao projeto autorizado. Confirme a entrada novamente em leitura. Se a execução do DDL e o registro da versão ficarem fora de sincronia, pare e verifique o estado antes de repetir a operação.
5. Libere o frontend e execute a conferência pós-publicação. Mantenha a recuperação do frontend e o bloqueio de escrita separados da preservação do histórico financeiro.
