# Auditoria pré-publicação da Retaguarda

Auditoria de 17/11/2026 do [PR #24](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/24). A inspeção em produção foi feita por consultas de leitura ao catálogo e ao histórico de migrations. A execução do procedimento ocorreu em um projeto Supabase descartável no WSL.

## Histórico e objetos em produção

Cada linha remota tinha uma única entrada em `statements`. O SHA-256 do SQL registrado coincide com o arquivo do Git após converter CRLF para LF e remover espaços e quebras nas bordas. A comparação comprova igualdade do texto armazenado com essa normalização. A verificação do catálogo comprova a equivalência funcional no estado atual. A auditoria não recupera a transação original, o ambiente de execução ou os efeitos sobre as linhas existentes na época.

| Migration | Git | Supabase | SHA-256 normalizado, prefixo | Classificação e evidência no catálogo |
| --- | --- | --- | --- | --- |
| `dashboard_manual_sync` | `20261027200303` | `20261028053319` | `a6b325b2fd58` | **Equivalência confirmada.** `dashboard_automation_runs` tem campos de solicitação, coletor e execução, FK de autor com `ON DELETE SET NULL`, checks de status, origem e período, índices de execução ativa, chave de solicitação e busca por origem. `dispatch_dashboard_sync` e `finish_dashboard_sync_run` correspondem ao Git. Parte das RPCs evoluiu com o protocolo de prévias e com `20261103110504`. |
| `meta_preview_reservation_protocol` | `20261028181122` | `20261029171157` | `b0a66ae0d6c8` | **Equivalência confirmada.** Campos de operação, seleção, fingerprint e resultados, constraints de operação e gatilho ativo `BEFORE UPDATE` para proteger a reserva. `reserve_dashboard_sync`, `start_dashboard_sync_run`, `begin_dashboard_sync_collection` e a função do gatilho correspondem ao Git. As rotinas de métricas renomeadas e as RPCs de solicitação e coleta de prévias refletem `20261103110504`. |
| `meta_preview_receipt_validation` | `20261028185400` | `20261029171241` | `c60718523e96` | **Equivalência confirmada.** O SQL de validação do recibo coincide no histórico. A definição vigente de `verify_dashboard_preview_results` corresponde a `20261101125133`, após a atualização intermediária de restauração do recibo. |
| `meta_preview_status_compatibility` | `20261028185700` | `20261029171307` | `7f347d846417` | **Equivalência confirmada.** A mudança de compatibilidade de `get_dashboard_sync_status` coincide no histórico e a definição atual corresponde à revisão de permissões `20261103110504`. |
| `meta_preview_restored_previous_receipt` | `20261029203211` | `20261030122336` | `2bf7e4160dec` | **Equivalência confirmada.** O SQL intermediário de restauração coincide no histórico. `verify_dashboard_preview_results` foi substituída pela revisão de proveniência, que corresponde à definição vigente. |
| `meta_preview_receipt_restore_provenance` | `20261101125133` | `20261101133901` | `b3ef266695937` | **Equivalência confirmada.** `verify_dashboard_preview_results` corresponde ao corpo vigente que incorpora a proveniência da restauração. |

Foram comparados os corpos das 13 funções vigentes com suas últimas definições esperadas no Git, inclusive as rotinas legadas renomeadas. As 13 têm `search_path` vazio e pertencem a `postgres`. A função privada do gatilho tem execução restrita ao proprietário. As outras 12 têm execução concedida ao proprietário e a `service_role`, com acesso direto ausente para `anon` e `authenticated`. `dashboard_automation_runs` mantém RLS e a política de leitura por associação do cliente. As seis migrations não redefinem essa política. O SQL do registro alinhado `20261103110504` também coincide com o Git após a mesma normalização.

Para refazer a comparação do texto por leitura, use `supabase_migrations.schema_migrations` e calcule `encode(sha256(convert_to(btrim(replace(statements[1], chr(13) || chr(10), chr(10)), E' \t\n\r'), 'UTF8')), 'hex')`, conferindo primeiro a cardinalidade de `statements`. Para o estado vigente, consulte `pg_proc`, `pg_constraint`, `pg_index`, `pg_trigger` e `pg_policies` e compare as definições com a última migration que modifica cada objeto.

## Compatibilidade da migration financeira

- Produção tem PostgreSQL 17.6, `dashboard_clients(id)`, a chave única válida `(client_id, source, account_id)` de `dashboard_source_accounts`, a associação em `dashboard_client_users` e o constraint `viewer/editor/admin`. Os grants para o papel `authenticated` usar o esquema privado, a função de associação e consultar a associação sob RLS estão presentes. Há seis vínculos Admin, três Editor e nenhum Viewer no cliente auditado.
- A tabela, os nomes de funções e índices financeiros e a entrada `20261117045349` estavam livres na auditoria. O SHA-256 dos bytes versionados de `20261117045349_retaguarda_financial_entries.sql` é `624c6c91fc3337c128f0016ffc91e78d681aa4ba16ade6000f97f4e0fa246824`.
- As chaves estrangeiras vinculam cada registro à conta correta e limitam as correções ao mesmo cliente, plataforma, conta e data. Índices e constraints garantem raiz única por conta e data, até um sucessor e idempotência de requisições e origem. A tabela só recebe inclusões e o gatilho bloqueia `UPDATE`, `DELETE` e `TRUNCATE`.
- RLS permite leitura de membros e escrita manual de Admin e Editor com autoria derivada da sessão. Os grants explícitos por coluna impedem o cliente de escolher autoria ou origem. `service_role` tem acesso próprio para ingestão confiável. A RPC pública usa permissões do chamador e a função privada privilegiada verifica o vínculo, com `search_path` vazio. Na janela de publicação, confirme `public` na Data API e `private` fora dos esquemas expostos.
- O DDL é transacional e os índices são criados sobre uma tabela inicialmente vazia. As FKs adquirem locks nas tabelas referenciadas. Use janela de baixa atividade e limites de espera para obter locks e concluir as instruções.

## Escolha de implantação

| Estratégia | Benefício | Risco e pré-requisito |
| --- | --- | --- |
| **A. Reconciliar o histórico** | Restaura o fluxo convencional para migrations futuras. | Requer inventário de todos os ambientes que já registraram uma das versões e decisão explícita sobre alinhamento dos arquivos ou do histórico. Uma conciliação incorreta torna possível reexecutar SQL antigo, inclusive alterações de dados. Exige ensaio e autorização próprios. |
| **B. Aplicação isolada** | Limita a alteração de esquema à tabela financeira e registra uma única versão, preservando as entradas antigas. | O commit do DDL e o registro no histórico são operações distintas. Exige execução do arquivo aprovado, conferência do esquema antes do registro e verificação posterior do histórico. As seis divergências continuam visíveis. |

**A estratégia B é a recomendada para este PR.** A conciliação pode ocorrer em outra janela. Até resolvê-la, o fluxo convencional de `db push` para produção segue bloqueado operacionalmente.

## Ensaio descartável

A pilha local usou Supabase CLI 3.2.0, PostgreSQL, Auth e PostgREST. Foram carregadas as três migrations-base necessárias para clientes, associação e contas, com fixture de papéis sintético. As seis versões remotas foram representadas por marcadores no histórico local com os mesmos identificadores. O procedimento validou a divergência de versionamento, com escopo limitado ao esquema-base necessário à Retaguarda.

1. `migration list` mostrou as seis divergências simuladas e a ausência da versão financeira no banco local.
2. Uma falha forçada ao fim da transação reverteu o DDL. Tabela, funções, índices e entrada financeira continuaram ausentes.
3. A aplicação isolada criou os objetos. O teste SQL terminou em `ok 1`. O DDL isolado deixou o histórico intacto até a etapa de registro.
4. Requisições a Auth e PostgREST com sessões sintéticas validaram Admin, Editor, Viewer, externo e anônimo, incluindo autoria, isolamento, conflitos de versão, idempotência e importação sintética.
5. `migration repair 20261117045349 --status applied` foi executado contra a pilha local, registrou somente `20261117045349` e preservou os seis marcadores. A leitura do histórico e o `migration list` confirmaram o resultado.

O backup restaurável, os locks na janela real, o schema cache remoto, o OAuth Google e os vínculos reais continuam pendentes. Os cenários de formulário e expiração com a pilha real foram validados na homologação anterior. A revisão pré-publicação concentrou-se na instalação e no histórico.

## Ordem de publicação após autorização

1. Confirme a revisão do PR, o SHA do head e o check concluído de TypeScript, testes e build. Confira o diff final, a relação com `main`, o projeto Pages e as variáveis públicas do frontend. Obtenha aprovação para a etapa de banco, com janela e responsáveis definidos.
2. Calcule o SHA-256 sobre os bytes do arquivo no commit aprovado e compare com o registrado nesta auditoria. Confira que a PR contém somente essa nova migration.
3. Confirme a existência de backup restaurável dentro da janela e registre a evidência da restauração em ambiente isolado. Registre também os totais de referência das fontes atuais em um período fechado para comparar após publicar.
4. Confirme a referência do projeto de destino por uma segunda verificação independente da conexão. Revalide pré-requisitos, ausência dos objetos novos, histórico de migrations, esquema exposto e disponibilidade dos perfis de teste autorizados.
5. Aplique apenas o arquivo aprovado com a conexão autorizada, `psql -X --single-transaction -v ON_ERROR_STOP=1 -c "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s';" -f <arquivo-aprovado>`. Interrompa a mudança se ocorrer timeout ou retorno diferente de zero. Confira o catálogo antes de planejar outra tentativa.
6. Confira tabela, FKs, constraints, índices, RLS, grants de tabela e coluna, RPC, gatilho e o cache do PostgREST. Após a conferência, registre apenas `20261117045349` com `migration repair 20261117045349 --status applied` e alvo remoto explícito. Confirme a opção no `--help` da CLI aprovada para a janela. Na v3, confira `--remote=<ref>`. Na v2, `--linked` exige validar antes o projeto vinculado. Leia o histórico novamente e compare as seis entradas anteriores com o inventário.
7. Faça consultas de leitura pela Data API com as sessões aprovadas. Confira Admin, Editor, o vínculo de leitura quando disponível, o bloqueio anônimo e o isolamento entre clientes. Se não houver sessão real de Viewer, registre a limitação e confira os contratos e grants sem criar um vínculo por conta própria. A criação de qualquer perfil exige autorização própria.
8. Solicite liberação para o merge e confirme que o SHA segue igual ao aprovado. O merge aciona o workflow de Pages.
9. Acompanhe o deploy de Pages até concluir. Confirme a versão servida e o acesso direto a `?view=retaguarda`.
10. Valide Google OAuth e os indicadores de Google Ads, Meta Ads e GA4. Compare o período de referência e verifique as páginas anteriores, a navegação e os filtros.
11. Sob autorização de escrita, faça o primeiro cadastro financeiro com conta, data e montantes validados pela equipe. Execute uma correção apenas com valores cuja alteração também tenha sido autorizada.
12. Confira a versão vigente, a versão anterior, autoria, datas, conta, isolamento entre clientes e acesso somente leitura. Registre o resultado da janela.

## Recuperação e importação histórica

Se a transação de DDL falhar, confirme o rollback e mantenha o frontend anterior. Se o DDL já estiver aplicado e o registro de versão falhar, mantenha a tabela, pause a publicação e confira catálogo e histórico antes de concluir o registro. Se o problema ocorrer após a publicação, restaure a revisão anterior do frontend por uma publicação autorizada e preserve a tabela, a migration, o histórico e os registros financeiros. Se for necessário suspender escrita, o operador deve revogar os grants **de inclusão por coluna** de `authenticated` em mudança revisada e conferir a leitura. Reabra a escrita após os testes de fumaça. A restauração integral do banco fica reservada a incidente de perda ou corrupção, com revisão da janela de perda e preservação dos lançamentos posteriores ao backup.

A importação histórica segue independente. A interface e a API funcionam com a tabela vazia e a interface sinaliza valores ausentes. A estrutura aceita data de referência anterior, horário de medição quando disponível, origem `import`, chave de origem e referência à versão anterior. O [guia financeiro](retaguarda-financeiro.md) descreve o dry-run e os requisitos do arquivo original. A auditoria usou somente dados históricos sintéticos no ensaio.
