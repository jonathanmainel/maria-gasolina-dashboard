# Proposta final de RLS — Incremento 05 — pacote v3

**Revisão de 23/10/2026. Pacote v3 aplicado e homologado somente no projeto isolado `uwafdxsdsgqysjjxfywo`, com Auth/JWT/REST reais e dados sintéticos. Produção não alterada; aplicação em produção e nomeação dos editores continuam pendentes de aprovação.** A edição operacional permanece bloqueada no frontend. Resultados e evidências: [relatorio-homologacao.md](./relatorio-homologacao.md).

A execução real identificou e corrigiu parênteses necessários em um `CASE` da checagem final PL/pgSQL. A tentativa que falhou foi revertida integralmente pela transação; a versão corrigida foi aplicada no sandbox. Não houve alteração do modelo de permissões.

## Ajustes desta revisão

Os três pontos informados foram reconfirmados no catálogo de produção, somente por SELECT: CHECK ainda em viewer/manager/admin; DELETE não concedido a authenticated; nenhum trigger na tabela manual. Existem oito vínculos viewer e nenhum manager legado em nenhum cliente do projeto acessível.

- **Constraint:** o SQL v3 inventaria manager globalmente e aborta se encontrar algum; valida a existência do CHECK antes de substituí-lo por viewer/editor/admin. Não promove nem converte vínculos.
- **DELETE:** mantida a exclusão comercial restrita a admin do próprio cliente, com GRANT DELETE e policy específica no mesmo arquivo. Metas permanecem sem DELETE. A integração posterior acrescentou a confirmação de exclusão na interface; ela continua bloqueada pelo gate operacional nesta revisão.
- **Autoria:** cria o trigger novo `dashboard_manual_guard`, BEFORE INSERT OR UPDATE. Define updated_by por auth.uid(), horário no servidor e impede mudar client_id, scope, id e created_at. Não depende de trigger já existente.
- **Reversão:** agora repetível; verifica grants efetivos e preserva leitura, dados, papéis e trigger. Não restabelece escrita ampla para viewers.
- **Homologação:** o caminho principal passa a ser Auth + REST em Supabase isolado, descrito em [homologacao-supabase.md](./homologacao-supabase.md). A suíte SQL com identidade simulada fica complementar; não comprova sessão real.

## 1. Decisão proposta e motivo

Adotar exatamente `viewer`, `editor` e `admin`, com autorização consultada em `dashboard_client_users` para o par `(auth.uid(), client_id)` da linha. Os papéis são atributos do vínculo com um cliente, não papéis globais da conta. Um administrador de outro cliente não recebe acesso à Maria Gasolina.

O banco será a barreira de segurança, inclusive para chamadas diretas à API. O frontend continua responsável por explicar permissões e esconder controles indisponíveis. Não confiar em `user_metadata`, perfil enviado no payload, query string, chave do navegador ou estado local.

Substituir `manager` por `editor` no CHECK da tabela é uma alteração do contrato de papéis, proposta para aprovação; não é uma conversão automática de usuários. Não existem vínculos `manager` na auditoria atual. O SQL aborta se encontrar algum na reaplicação da auditoria, evitando decidir silenciosamente que um gerente antigo deve ganhar escrita.

Usar a tabela existente evita criar outro armazenamento comercial. Um helper **SECURITY INVOKER** verifica o próprio vínculo, respeitando a política `self_select` já existente; não há necessidade de um novo helper que burle RLS. O helper antigo de associação permanece intacto, inclusive para consultas de mídia. A autorização verifica o banco a cada comando: o rebaixamento de um editor passa a valer nas consultas seguintes, sem depender da renovação do JWT (não cancela comandos já em execução).

## 2. Evidência atual — consultas exclusivamente de leitura

| Item | Resultado verificado em 23/10/2026 |
|---|---|
| Cliente | ID `1`, slug `maria-gasolina` |
| Vínculos | 8, todos `viewer`; nenhum editor/admin nomeado |
| Demais vínculos no projeto | Nenhum cliente adicional nos vínculos auditados |
| Papéis aceitos hoje | `viewer`, `manager`, `admin`; padrão `viewer` |
| Registros em `dashboard_manual_inputs` | 0 em toda a tabela |
| RLS | Habilitada em ambas as tabelas |
| Políticas manuais | SELECT, INSERT e UPDATE por associação ao cliente, sem papel |
| Política de vínculos | Somente SELECT do próprio `user_id` |
| Grants manuais | `authenticated`: SELECT/INSERT/UPDATE; `anon`: nenhum |
| Grants de vínculos | `anon` e `authenticated`: privilégios amplos, inclusive TRUNCATE |
| Privilégios efetivos | Confirmados por `has_table_privilege`; ambos sem SUPERUSER/BYPASSRLS |
| Triggers manuais | Nenhum trigger de usuário |
| Funções públicas/privadas que referenciam estas tabelas | Somente `private.is_dashboard_client_member(bigint)`, SECURITY DEFINER existente |

A consulta de dependências acima não equivale a uma auditoria geral de todas as extensões, serviços externos ou caminhos privilegiados do projeto. Proprietário, SQL Editor e `service_role` podem contornar RLS; essas credenciais ficam fora do navegador e não servem para provar permissões de usuários comuns.

O SQL deve parar se aparecerem vínculos ou registros de outros clientes antes da aplicação. Não queremos mudar a operação de outro cliente sem inventário. Depois da implantação aprovada, as regras são reutilizáveis e sempre limitadas ao cliente do vínculo: não existe exceção de escrita por ter `client_id = 1`.

## 3. Matriz final proposta

| Operação no próprio cliente | viewer | editor | admin |
|---|---|---|---|
| Ler registros manuais e metas permitidos | Sim | Sim | Sim |
| Inserir/atualizar snapshot e resultado comercial | Não | Sim | Sim |
| Inserir/atualizar metas e configurações (`business`) | Não | Sim | Sim |
| Excluir registro comercial válido, em operação explícita | Não | Não | Sim |
| Excluir metas/configurações | Não | Não | Não |
| Ler o próprio vínculo | Sim | Sim | Sim |
| Alterar a tabela de permissões diretamente pela API | Não | Não | Não |
| Acessar cliente sem vínculo | Não | Não | Não |
| Transferir linha existente entre clientes/frentes/scopes | Não | Não | Não |

Os editores podem operar todas as cinco frentes de seu cliente. Não há ACL por frente neste contrato; se necessária, precisa de proposta específica. A exclusão administrativa só abrange scopes comerciais válidos; não cria botão de exclusão e não autoriza apagar metas. A aprovação deste documento não executa nenhuma exclusão.

### Impacto deliberado sobre metas e configurações

O scope `business` guarda `goals` e `delivery`, podendo conter campos legados. **Nenhum payload será apagado, migrado, normalizado ou regravado por este SQL.** A leitura permanece por associação ao cliente. O validador aceita o objeto `business` existente, inclusive chaves legadas, sem tratá-las como resultados comerciais; o leitor comercial usa somente scopes `crm_*`.

A mudança é de permissão: viewers deixarão de conseguir salvar metas/conteúdos no servidor. Esta proposta adota leitura para viewer em toda a tabela, para não manter uma exceção de escrita difícil de explicar. Preservar valores não significa preservar o privilégio amplo anterior. Editor/admin continuarão editando `business`. Se o cliente desejar um perfil separado para metas, isso deve ser aprovado antes da aplicação, em vez de reabrir escrita geral para viewers.

O editor de Metas atual ainda não possui essa restrição visual; uma tentativa de viewer será negada pelo banco e deve aparecer como erro, sem falsa confirmação. Antes de liberar a operação, alinhar também seus controles ao papel. O serviço atual não transforma erro RLS em salvamento local; há fallbacks locais para ausência de configuração/tabela/cliente, fora do alcance da RLS. Na homologação autenticada, confirmar `storage = supabase` e proibir anunciar persistência operacional se o serviço estiver em fallback. Não apagar as preferências locais.

## 4. SQL final proposto e alterações exatas

Os arquivos abaixo são o pacote revisável. Não estão em migrations e não são executados automaticamente por build/deploy:

- [rls-proposta.sql](./rls-proposta.sql): transação final, verificações antes/depois, CHECK de papéis, helpers, trigger, políticas e grants.
- [testes-rls.sql](./testes-rls.sql): testes SQL complementares, exclusivos de PostgreSQL descartável vazio chamado `mg_rls_sandbox`; não executar em Supabase.
- [homologacao-supabase.md](./homologacao-supabase.md): plano remoto sem Docker/psql, alternativas, sequência e critérios de aceite.
- [homologacao-bootstrap.sql](./homologacao-bootstrap.sql) e [homologacao-vinculos.sql](./homologacao-vinculos.sql): fixtures sintéticas protegidas, somente para destino isolado aprovado.
- [testes-rls-rest.mjs](./testes-rls-rest.mjs): executor de testes com Supabase Auth e API REST reais; produção explicitamente recusada.
- [testes-executor-rest.test.mjs](./testes-executor-rest.test.mjs): testes locais do executor com transporte simulado, separados da homologação da RLS.
- [rls-nomeacao-modelo.sql](./rls-nomeacao-modelo.sql): nomeação individual com UUID inicialmente nulo, cliente fixado e expectativa do papel anterior.
- [rls-reversao-segura.sql](./rls-reversao-segura.sql): congelamento de escrita com leitura preservada, sem restaurar vulnerabilidades.

### Políticas substituídas e preservadas

| Política atual | Tratamento |
|---|---|
| `dashboard_manual_inputs_member_insert` | Removida; substituída por `dashboard_manual_inputs_editor_insert` |
| `dashboard_manual_inputs_member_update` | Removida; substituída por `dashboard_manual_inputs_editor_update` |
| `dashboard_manual_inputs_member_select` | Preservada sem alteração |
| `dashboard_client_users_self_select` | Preservada sem alteração |
| Nenhuma DELETE atual | Nova `dashboard_manual_inputs_admin_delete`, somente comercial/admin do cliente |

As duas regras amplas são removidas na mesma transação que cria as novas. Apenas acrescentar políticas permissivas mais estreitas não resolveria o problema: elas se combinam por OR. As políticas de UPDATE verificam a linha atual em USING e a resultante em WITH CHECK. SELECT continua disponível para o UPDATE e para a leitura autorizada.

Núcleo do controle (o arquivo completo inclui validação, proteção de escopo e grants):

```sql
CREATE POLICY dashboard_manual_inputs_editor_insert ON public.dashboard_manual_inputs
FOR INSERT TO authenticated WITH CHECK (
  private.dashboard_manual_has_role(client_id, ARRAY['editor','admin'])
);
CREATE POLICY dashboard_manual_inputs_editor_update ON public.dashboard_manual_inputs
FOR UPDATE TO authenticated
USING (private.dashboard_manual_has_role(client_id, ARRAY['editor','admin']))
WITH CHECK (private.dashboard_manual_has_role(client_id, ARRAY['editor','admin']));
```

### Integridade, autoria e isolamento

- O trigger impede alterar `id`, `client_id`, `scope` e `created_at`, mesmo que um usuário seja editor dos dois clientes. Não basta verificar o vínculo da linha nova: transferir uma linha também é proibido.
- Frente, tipo, período e scope precisam corresponder. Alterar apenas `payload.front` não transfere um pipeline. Para outra frente/período, deve existir outro registro autorizado.
- Snapshot tem oito ou dez etapas corretas; contagens obrigatórias são inteiros não negativos. Tempos e ticket podem estar ausentes, sem virar zero. Não admite tempos para Contrato, que não os utiliza no contrato atual.
- Resultado tem contratos fechados e receita, período válido/ordenado e idêntico ao scope. Nenhum cálculo é alterado. Não aceita média de etapas nem inferência de receita.
- O envelope exige versão 1 e origem `manual`. A prévia não é persistida. O banco não consegue identificar se um número plausível digitado por um editor é fictício; essa responsabilidade continua com a pessoa e com a separação da prévia no aplicativo.
- Chaves desconhecidas são recusadas nos envelopes comerciais. As contagens ficam limitadas a inteiros representáveis com precisão em JavaScript; valores financeiros/tempos devem caber em número finito. É validação mais estrita que parte dos testes de frontend atuais, a homologar antes de liberar edição.
- `updated_by` e `updated_at` são definidos pelo servidor; `created_at` também é definido no INSERT. `updated_by` enviado pelo navegador é substituído. Preserva a compatibilidade do upsert por `(client_id, scope)`.
- O guard requer `auth.uid()` para INSERT/UPDATE: futuras importações Elo via service role sem usuário não poderão reutilizar este caminho indiscriminadamente. Aprovar contrato de origem/ingestão separadamente. Não alterar integrações atuais para contornar o guard.
- Não há histórico de versões: autoria/horário representam a última atualização; editores concorrentes ainda seguem última gravação vence. Isso não é uma trilha completa de auditoria.

### Grants e permissões de membros

Revogar privilégios de `PUBLIC`, `anon` e `authenticated` sobre vínculos; devolver somente SELECT a `authenticated`, sob `self_select`. Nenhum usuário comum pode promover a si ou a outros por INSERT/UPDATE. Remover também TRUNCATE, REFERENCES e TRIGGER. TRUNCATE não é controlado por RLS; não afirmamos que o endpoint REST o expõe.

Na tabela manual, `authenticated` precisa de grants SELECT/INSERT/UPDATE/DELETE, mas RLS decide quais usuários/linhas podem usar cada operação. Viewer pertence ao papel SQL `authenticated`, porém suas condições de escrita nunca passam. `anon` não recebe grants. Uma checagem posterior aborta a transação se houver privilégios inesperados herdados ou por coluna. Grants de `service_role`, proprietário, políticas de outras tabelas, Auth, funções de mídia e RLS existente fora dessas duas tabelas não são modificados.

Não conceder UPDATE genérico de vínculos a administradores. Nesta fase, a nomeação será feita por operador confiável, mediante decisão nominal do responsável. Uma futura interface administrativa poderá usar RPC específica, com verificação de admin daquele cliente, enumeração de papéis, impossibilidade de mudar cliente/user, impedimento de remover/rebaixar último admin e trilha de autoria/instante. **Essa RPC e essa interface não estão implementadas nem prometidas por este SQL.** Até lá, admin gerencia dados e solicita mudanças de acesso pelo procedimento controlado.

## 5. Como designar os primeiros editores

1. O responsável indica nominalmente quem precisa preencher números, separando essa necessidade de quem deve administrar acessos. Nenhum dos oito viewers é escolhido por conveniência ou por estar autenticado.
2. Confirmar a identidade no cadastro Auth e o vínculo existente com cliente `1`/`maria-gasolina`. Não usar apenas nome de exibição nem criar conta por suposição. Registrar UUID em documento privado, nunca no repositório público.
3. Aprovar uma lista com pessoa, papel desejado, cliente, justificativa, autorizador e data de revisão. Escolher primeiro administrador exige aprovação própria; não é pré-requisito para promover todos a admin.
4. Fazer backup privado dos vínculos afetados e do estado de segurança antes da aplicação. Aplicar RLS aprovada antes de qualquer promoção.
5. Operador administrativo executa uma nomeação por transação usando o modelo: `WHERE client_id=1 AND user_id=<UUID aprovado> AND role='viewer'`; exigir exatamente uma linha. Nunca executar `UPDATE ... WHERE role='viewer'` para todo o cliente.
6. Conferir o papel resultante, os demais sete vínculos e os vínculos de outros clientes. Registrar antes/depois e operador no controle privado da mudança. Testar a nova sessão sem gravações de teste em produção.
7. Revogação individual usa os mesmos filtros e expectativa do papel atual. Ao rebaixar admin, confirmar antes que outro administrador permanecerá. Não atualizar metadados Auth para substituir o vínculo no banco.

## 6. Testes de segurança e critérios de aceite

### Suíte SQL preparada

O arquivo `testes-rls.sql` prepara um contrato mínimo em **PostgreSQL descartável**, aplica a proposta com `\ir` e testa operações sob `SET LOCAL ROLE authenticated/anon`, com UUIDs artificiais. Não executá-lo no projeto real, mesmo que envolva ROLLBACK: fixture e DDL têm suas próprias transações. O script aborta fora do banco vazio dedicado.

Foram preparadas **56 verificações SQL explícitas**. Foram executadas com sucesso no sandbox real, em versão adaptada para preservar Auth nativo e usar as contas sintéticas já criadas. A preparação e as alterações da fixture ocorreram dentro de transação revertida. O arquivo original de bootstrap local continua exclusivo de PostgreSQL descartável. Os testes incluem:

| Cenário | Resultado esperado |
|---|---|
| Viewer SELECT próprio cliente | Permitido; valores preservados |
| Viewer INSERT/UPDATE/DELETE e upsert | Negado ou zero linhas; estado anterior intacto |
| Viewer grava metas ou promove a si próprio | Negado; nenhuma alteração |
| Editor INSERT/UPDATE e upsert próprios | Permitido, inclusive cinco frentes independentes |
| Editor DELETE | Negado/zero linhas |
| Editor/admin sem vínculo em outro cliente | Sem leitura nem escrita; inclusive filtros omitidos/adulterados |
| Editor com vínculo em dois clientes muda client_id da linha | Negado pelo guard |
| Admin INSERT/UPDATE/DELETE comercial do próprio cliente | Permitido |
| Admin exclui metas, altera permissões diretamente ou acessa outro cliente | Negado |
| Anônimo ou sessão sem auth.uid() | Sem leitura/escrita manual autorizada |
| INSERT/UPDATE/DELETE/TRUNCATE em vínculos pela API | Negado para usuários comuns; self_select preservado |
| Front/scope/ID/criação alterados | Negado |
| Período incompatível, data inexistente, contagem ausente/negativa/fracionária | Negado sem preencher ausência com zero |
| Envelope de origem demo | Negado; prévia continua local |
| Horário/autor adulterados | Substituídos pelos valores do servidor |
| user_metadata indicando admin | Não concede acesso |
| Editor rebaixado para viewer, mesmo JWT | Próxima gravação negada |
| Dados de outro cliente e metas sentinelas | Conteúdo original preservado |

Para UPDATE/DELETE, RLS pode retornar sucesso HTTP com **zero linhas**. O teste deve conferir linhas afetadas e reler os valores; ausência de exceção não prova autorização. Erros de integridade e de autorização devem ser diferenciados de erros de sintaxe/transporte.

### Homologação autenticada obrigatória após autorização

Conforme o plano remoto separado, executar primeiro em projeto Supabase de homologação ou branch descartável aprovada, usando contas de teste viewer/editor/admin e uma conta de outro cliente. Validar a API REST real, inclusive `POST` com `Prefer: resolution=merge-duplicates` e retorno de representação, `PATCH` adulterando `client_id`/scope, `DELETE`, edição de metas e tentativas de promoção via `/dashboard_client_users`. Usar tokens de usuário comum, não service role/SQL Editor. Conferir também editor somente em A e viewer em B: não deve gravar B.

A fixture SQL simula a identidade da sessão; não comprova assinatura/expiração JWT, comportamento do PostgREST nem uma sessão real do navegador. A homologação deve passar pelas sessões reais do executor REST e pelos casos autenticados adicionais. A camada SQL é complementar e não torna Docker/psql um requisito obrigatório. Não criar registros de teste na produção.

### Situação dos testes nesta revisão

- Equivalência inicial com produção: três tabelas, 18 colunas, 13 constraints, sete índices, cinco políticas, duas funções e grants comparados sem divergências nos objetos selecionados.
- SQL no sandbox real: **56 verificações de autorização e 23 de validação de payload aprovadas**. Contextos SQL são complementares e não substituem as sessões reais.
- Auth + REST: **55 verificações base, 12 adicionais, 17 em reversão/congelamento e seis de recuperação aprovadas**. Tokens emitidos por Auth para cinco contas sintéticas, sem service role; adulteração de metadata, revogação com o mesmo JWT e papéis diferentes por cliente testados.
- Verificações anônimas reais: três requisições negadas. Executor: 18 testes locais com transporte simulado, contabilizados separadamente.
- Reversão e recuperação: oito registros sintéticos preservados; leitura mantida e escrita negada no congelamento. Ambiente deixado congelado ao concluir, para revisão.
- Frontend reconhece viewer/editor/admin em Vendas e Metas; papel desconhecido falha fechado. Gate `COMMERCIAL_ACCESS_POLICY_READY = false` preservado. Nenhuma liberação operacional por esta homologação.
- Resultados locais e limitações detalhados no relatório. Testes E2E usam demonstração com rede externa bloqueada e não comprovam carregamento real de mídia/GA4.

## 7. Aplicação futura, com autorização específica

1. Homologação isolada concluída. Aprovar explicitamente aplicação em produção e responsáveis nominais, separadamente da homologação.
2. Revisar os resultados do sandbox e fixar o SQL aprovado pelo hash. Repetir a comparação do catálogo vivo antes de aplicar; se houver mudanças relevantes, interromper e re-homologar o contrato alterado.
3. Capturar backup privado recuperável de DDL/políticas/ACL/funções/constraints/triggers das duas tabelas, e dos dados/vínculos envolvidos. Incluir roles/permissões dependentes. Não colocar dumps, tokens ou lista nominal em Git. Conferir restauração no ambiente isolado.
4. Repetir a auditoria somente de leitura e comparar definições exatas, contagens e dados com o backup. Os guards do SQL não substituem essa conferência e abortam diante das divergências previstas.
5. Aplicar somente o arquivo aprovado, em uma transação por operador autorizado. Lock curto com timeout evita aguardar indefinidamente. Qualquer falha antes do COMMIT aborta tudo; não continuar ignorando erro.
6. Conferir estado e privilégios depois do COMMIT; conferir que contagens e conteúdo permanecem iguais. Nomear apenas os usuários aprovados.
7. Frontend e testes locais já foram alinhados a `editor`, incluindo Metas. Revisar o diff e manter o gate bloqueado até a aplicação e as verificações de produção. Migrações históricas permanecem intactas.
8. Somente depois de RLS + homologação autenticada aprovadas, revisar `COMMERCIAL_ACCESS_POLICY_READY`. Não basta atribuir `editor` no banco: o gate de liberação permanece falso e exige revisão explícita posterior.
9. Publicação depende de aprovação separada. Este pacote não altera workflow, branch publicada, integrações, campanhas, métricas, funis, Auth nem dados reais.

## 8. Plano de reversão

**Antes do COMMIT:** qualquer erro provoca ROLLBACK da transação inteira, preservando o estado anterior. Executar com interrupção no primeiro erro; nunca enviar COMMIT depois de transação abortada.

**Depois do COMMIT:** manter/repor o bloqueio de edição da interface e, mediante autorização, executar `rls-reversao-segura.sql`. Ele revoga escrita dos papéis de API e adiciona políticas restritivas de negação. SELECT continua funcionando; metas, registros, vínculos e novos papéis não são apagados nem sobrescritos. Confirmar que viewer/editor/admin só leem e que a leitura de mídia permanece normal.

O script de congelamento pode ser repetido e aborta se detectar privilégios herdados/por coluna que ainda permitam escrita. Ensaiar o executor REST com `--frozen` no ambiente isolado. Essa é uma reversão de disponibilidade da edição, não uma restauração cega do esquema vulnerável. Restaurar as antigas políticas de associação reabriria escrita para viewers; não é a alternativa segura e exige nova decisão explícita. Não remover `editor` do CHECK enquanto houver usuários nesse papel. Uma restauração estrutural completa deve partir do backup validado, sob bloqueio de escrita, com revisão dos vínculos e autorização específica. Não executar rollback de dados automaticamente.

Para corrigir e reabrir depois do congelamento: testar a correção em staging, aprovar nova transação e remover somente as três políticas `dashboard_manual_inputs_emergency_no_*`, restabelecendo os grants aprovados. Não remover a barreira emergencial antes da verificação.

## 9. Referências e limites

- [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security): combinação de autenticação, grants e políticas; UPDATE depende de SELECT; riscos de metadados editáveis.
- [CREATE POLICY no PostgreSQL](https://www.postgresql.org/docs/current/sql-createpolicy.html): USING/WITH CHECK, políticas permissivas/restritivas e verificações após BEFORE trigger.
- [TRUNCATE no PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): operações de tabela inteira não estão sujeitas a RLS.

Os modelos Places/Expansão e os envelopes continuam preparados para um futuro adaptador Elo. Este SQL aceita somente origem manual: a futura integração precisará de contrato de origem e privilégios de ingestão aprovados, sem reutilizar chave privilegiada no navegador.
