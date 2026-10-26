# Incremento 05 — integração e homologação para revisão

Data: 23/10/2026. Resultado: integração local homologada; sandbox recongelado e restaurado. A tarefa completa ainda depende da RLS de produção, das decisões individuais de acesso e da publicação autorizada.

## 1. Estado da integração

- Branch: `codex/incremento-05-integracao`.
- Base: `c75db340ca4224f1d0e8d3e0b5c32738a774cfcf`, origin/main com os PRs #3, #4 e #5. O main remoto foi conferido novamente ao final e continua nesse commit.
- Worktree: `work/integracao` neste chat.
- Dez worktrees anteriores preservados. Agora existem onze, contando somente o novo checkout.
- 234 arquivos da branch original conferidos por SHA-256 contra a cópia anterior: todos inalterados.
- 77 arquivos protegidos idênticos ao main: API de mídia, Auth, cliente Supabase, recarga, previews, funções, migrations e workflow, entre outros.
- Sem commit, push, PR, merge, deploy ou execução de GitHub Actions nesta etapa. Alterações estão disponíveis para revisão no checkout separado e no ZIP de fontes.
- A liberação operacional continua `COMMERCIAL_ACCESS_POLICY_READY = false`.

A integração utiliza a base publicada para evitar regressões nos componentes recentes. Aproveita os contratos comerciais já desenvolvidos, sem trocar bibliotecas, reescrever o dashboard ou criar uma integração Elo.

## 2. Funcionalidades integradas

- Rótulos Places e Vendas; IDs técnicos e URLs preservados.
- Seleção Places/Expansão e segundo seletor somente quando há várias frentes.
- Cinco frentes independentes: Condomínios, Empresas, Academias, Hospitais e Franquias.
- Dois modelos centrais com oito/dez etapas. A navegação e a paginação leem o registro de frentes e esses modelos compartilhados.
- Snapshot atual independente do resultado do intervalo exato. Ausência permanece desconhecida; não há conversão calculada entre estoques de etapas.
- Vendas, Metas e conteúdos/configurações manuais reutilizam a autorização do vínculo.
- Gravações revalidam a sessão e o papel; falha remota não produz sucesso local na operação.
- Exclusão comercial com confirmação de frente/natureza/período, somente para admin autorizado. O transporte limita client_id e scope e exige a representação de exatamente uma linha; zero linhas gera erro.
- Não existe caminho de exclusão de business/metas na interface comercial.
- Perda de permissão bloqueia controles e fecha a confirmação visível. Troca de frente, período ou exemplos descarta o alvo de exclusão.
- Seletor de planilha em Configurações indisponível enquanto o perfil/gate impedir edição; o endpoint próprio de importação permanece inalterado.
- Exemplos publicados preservados, identificados e isolados da persistência operacional; retorno sem recarregar.
- Gráficos de canais e meses continuam usando a composição operacional mesmo ao ativar os exemplos comerciais.
- Apresentação responsiva e paginada preservada, com seleção das cinco frentes, fullscreen, teclado, modal de criativos e identificação explícita dos exemplos.
- Botão compacto de atualização, horário da consulta, criativos sem cortes e correções de números/overflow preservados.

A validação de payload no frontend foi alinhada às restrições já homologadas do SQL: contagens inteiras seguras, campos conhecidos, frente/scope/período coerentes e ausência de período em snapshot. O SQL v3 não foi alterado.

## 3. Resolução dos 15 caminhos sobrepostos

O diagnóstico identificou 15 caminhos alterados nos dois desenvolvimentos. Sete produziram conflitos textuais no Git; os demais também foram revisados.

| Arquivo | Resolução |
|---|---|
| e2e/crm-empty.spec.ts | Estados vazios do Incremento 05 com navegação Places/Vendas; mantidas verificações de mídia e slides paginados publicados. |
| src/components/Shell.nav.test.tsx | Rótulos novos conciliados com o isolamento do componente de recarga nos testes. |
| src/components/Shell.tsx | Somente nomes de exibição alterados; recarga compacta e status de consulta preservados. |
| src/components/ui/primitives.tsx | Mantidos pipelineTotal e comportamento recente; compatibilidade com a composição comercial existente. |
| src/lib/presentation-layout.test.ts | Mantidos testes do main e acrescentada cobertura de todas as etapas das cinco frentes. |
| src/lib/presentation-layout.ts | Paginação publicada preservada; etapas derivadas dos dois modelos e frentes adicionais do registro. |
| src/pages/Dashboard.tsx | Estado compartilhado de frente/exemplos e acesso de Metas integrado sem perder composição recente. |
| src/presentation.css | CSS publicado preservado; ajuste localizado no cabeçalho de seleção comercial. |
| src/styles.css | Somados estilos dos seletores e da confirmação de exclusão, mantendo os estilos recentes de recarga/criativos. |
| src/types.ts | Tipos comerciais conciliados com os tipos recentes de mídia/previews. |
| src/views/Crm.test.tsx | Contratos novos e teste de preservação dos gráficos reais do PR #5 mantidos juntos. |
| src/views/Crm.tsx | Hierarquia e persistência novas; mídia operacional separada dos exemplos; exclusão autorizada concluída. |
| src/views/data-origin.test.tsx | Preservadas verificações publicadas de origem/paginação e adaptadas fixtures para o contrato de cinco frentes. |
| src/views/FrontView.tsx | Painéis comerciais integrados sem substituir ranking, previews ou modal mais recentes. |
| src/views/Presentation.tsx | Implementação paginada do main mantida e ampliada. A apresentação antiga de cinco slides não foi transposta. |

O teste publicado de troca de exemplos foi adaptado de uma aba direta Condomínios para Places → Condomínios. Valores esperados e verificações de recarga, retorno e apresentação permaneceram.

A lista completa de arquivos modificados/adicionados está em `arquivos-modificados.json`. O patch contém somente arquivos já rastreados; o ZIP inclui também todos os novos arquivos necessários.

## 4. SQL homologado e operação do sandbox

Hashes SHA-256 conferidos contra a cópia original anterior à integração:

| Arquivo | SHA-256 |
|---|---|
| rls-proposta.sql | b70a4b39d00df86c13362856d31779d12046cbbec92ec92d81cce2962cb44071 |
| homologacao-reabertura.sql | 453c13423f2c9303a32c8a5ecca3ddec815c31a7e27c62ef2e1261e95221ebfa |
| rls-reversao-segura.sql | 0ae31342f60dfff12e2dc14fddce9b7efc26091513e7c4a74228eff97e56cc09 |

Destino exclusivo da operação: `uwafdxsdsgqysjjxfywo`, com marcador RLS_SANDBOX_ONLY.
O modelo RLS v3 e suas funções/políticas de autorização não foram ampliados. Foram usados os scripts homologados para abertura temporária e recongelamento. SQL administrativo adicional limitou-se à preparação/restauração da fixture sintética autorizada, sem migrations.

As cinco contas sintéticas existentes foram confirmadas e recuperadas pela API administrativa do Auth. UUIDs, e-mails, vínculos e papéis preservados. Foram geradas senhas fortes e aleatórias. A chave administrativa ficou apenas na memória do processo; os testes usaram JWTs de usuário emitidos pelo Auth.

Arquivo privado de execução, fora do repositório/worktrees:
`[arquivo privado fora do repositorio e dos worktrees]`.

A pasta tem herança de ACL removida e acesso limitado ao usuário proprietário e SYSTEM. Nenhuma senha, token ou chave administrativa consta deste relatório, dos logs entregues ou do ZIP.

A produção `hlqrpreqvvxtkruwsolg` não foi acessada durante a operação temporária do sandbox e não recebeu alterações nesta etapa. Os oito viewers reais não foram promovidos.

## 5. Recuperação e integridade

O ensaio de restauração estrutural foi executado em esquema temporário do sandbox, com ROLLBACK:
- Três tabelas, 18 colunas, 13 constraints, sete índices e cinco políticas reconstruídos a partir do snapshot.
- Grants de tabela conferidos.
- Oito vínculos reproduzidos com UUIDs substituídos por aliases sintéticos e referências Auth de ensaio; nenhum usuário real foi importado.
- Constraint legada de papéis exercitada.
- Esquema temporário removido pelo ROLLBACK; registros e vínculos do sandbox permaneceram intactos.

Esse ensaio valida a reconstrução do contrato selecionado, não uma restauração integral de Auth ou de toda a produção. O snapshot privado contém material adicional de recuperação; deverá ser atualizado e conferido novamente antes de uma futura aplicação em produção.

Para repetir o executor REST original foi necessário usar sua fixture inicial de uma linha business. Antes disso, os oito registros e seis vínculos foram guardados. Após os testes, o sandbox foi primeiro congelado e depois esses registros/vínculos foram restaurados, com o trigger novamente habilitado e a sequência recolocada no estado capturado.

| Verificação final | Resultado |
|---|---|
| Registros manuais | Oito, conteúdo idêntico ao inicial |
| Vínculos | Seis, conteúdo e papéis idênticos ao inicial |
| Fingerprint dos registros | 26a044cfa154672bcea736a43964a49b — igual antes/depois |
| Fingerprint dos vínculos | 0c662702a6883085ef3feb9bfd983afa — igual antes/depois |
| Políticas | Oito definições idênticas ao snapshot inicial |
| Grants dos papéis de API | Idênticos: somente leitura nas duas tabelas afetadas |
| Constraints e trigger | Idênticos; trigger habilitado |
| Barreiras emergenciais | Três políticas restritivas presentes |
| Escrita authenticated por tabela/coluna | Negada |
| Esquema de ensaio residual | Nenhum |

**Sandbox recongelado e verificado. Nenhuma concessão temporária de escrita permaneceu ativa.**

As políticas preservadas são self_select dos vínculos e member_select, editor_insert, editor_update e admin_delete da tabela manual, além das três barreiras emergenciais no estado final. INSERT/UPDATE antigas por simples associação não foram restauradas.

## 6. Testes executados nesta integração

| Grupo | Resultado |
|---|---:|
| TypeScript | Aprovado |
| Unitários/componentes, suíte completa | 577 aprovados em 50 arquivos |
| Rechecagem final de permissões/origem após QA | 21 aprovados |
| E2E da aplicação | 42 aprovados |
| Regressões específicas do PR #3 | Quatro aprovados |
| Regressões dos PRs #4/#5 | Dez casos aprovados, incluindo repetição dirigida do cenário corrigido |
| E2E finais de Vendas/Metas/Apresentação | 13 aprovados, repetição dos cenários afetados pelo QA |
| Build e build Pages com subcaminho real | Aprovados |
| Empacotamento | Quatro aprovados |
| Executor REST com transporte simulado | 18 aprovados, separados da segurança real |
| REST base no sandbox aberto | 55 aprovados |
| REST congelado antes/depois | 17 + 17 aprovados |
| Anônimos adicionais | Três negados corretamente |

Há 56 casos E2E distintos aprovados entre a suíte da aplicação e as regressões; as rechecagens não foram somadas como casos novos.

As fases REST declararam 92 verificações: 55 + 17 + 17 + 3. O baseline contém dois casos anônimos; portanto são 87 verificações autenticadas e cinco anônimas, com repetições intencionais entre as fases. Isso não equivale à quantidade de requisições HTTP.

Nas execuções finais: zero verificações de segurança reprovadas. A suíte base cobre:
- viewer: leitura autorizada; INSERT, UPDATE, DELETE e upsert indevidos bloqueados.
- editor: INSERT/UPDATE/upsert do próprio cliente e das cinco frentes; DELETE bloqueado.
- admin: escrita autorizada e exclusão comercial; exclusão de business/metas bloqueada.
- Outro cliente, alteração de vínculo pela API, identidade/scope/cliente/criação adulterados, autoria do servidor, origem demonstrativa e payloads inválidos.

A interface foi validada com perfis controlados e o backend com Auth/REST reais. O gate operacional permaneceu falso; não houve liberação de escrita de usuários reais. Mídia/GA4 foram testados com dados locais/respostas controladas, preservando o contrato original; não foi feita uma nova extração da produção.

### Ocorrências intermediárias resolvidas

1. O executor REST inicialmente parou após cinco verificações de perfil porque esperava uma fixture com uma única linha business, em vez das oito linhas preservadas. A fixture foi preparada e a suíte completa passou; os oito registros originais foram restaurados no final.
2. Um cenário E2E encontrou o botão ilustrativo oculto no demo. O comportamento publicado foi preservado. A repetição revelou o seletor antigo no próprio teste; ele foi adaptado à hierarquia aprovada. O cenário passou integralmente.
3. Uma tentativa de recongelamento recebeu Invalid or expired requestState no transporte do conector. As demais atividades foram suspensas, o estado aberto foi confirmado e o mesmo script homologado foi repetido com sucesso. Nenhuma falha ficou pendente; integridade e bloqueio foram conferidos depois.
4. O build mantém o aviso existente sobre chunks maiores que 500 kB. Não foi feita refatoração de bundle fora do escopo.

## 7. Evidências visuais

Galeria: `galeria.html`, com capturas finais de Vendas desktop/mobile, apresentação desktop/mobile, Metas, recarga e criativo ampliado.

Verificações automatizadas e inspeção visual confirmaram:
- Identificação dos exemplos comerciais na apresentação, inclusive no demo global.
- Valores monetários sem quebra nos viewports exercitados.
- Cinco frentes acessíveis e todas as etapas paginadas.
- Ausência de overflow horizontal e de sobreposição das etapas.
- Fullscreen, teclado, seleção de frente e retorno preservados.
- Criativo vertical sem cortes e aviso para a imagem sintética de baixa resolução.

Os números nas capturas são demonstrativos ou fixtures sintéticas, não novos resultados de produção.

## 8. Checklist para aplicar a RLS em produção — ainda não autorizado

- [ ] Usuário revisa esta entrega e aprova a próxima etapa.
- [ ] Atualizar inventário somente de leitura da produção após autorização de acesso.
- [ ] Confirmar novamente oito viewers, ausência de managers em qualquer cliente, dados, grants, triggers e políticas esperados.
- [ ] Atualizar snapshot privado de recuperação e conferir sua integridade, dependências e procedimento de restauração.
- [ ] Reconfirmar o SQL exato pelo SHA-256 b70a4b39d00df86c13362856d31779d12046cbbec92ec92d81cce2962cb44071.
- [ ] Receber autorização explícita para executar exclusivamente esse pacote na produção.
- [ ] Manter o gate do frontend bloqueado.
- [ ] Aplicar em transação integral, interrompendo no primeiro erro.
- [ ] Conferir CHECK viewer/editor/admin, substituição das políticas antigas, grants efetivos, helpers e trigger.
- [ ] Confirmar leitura legítima preservada e escrita indevida dos viewers negada pela API.
- [ ] Comparar conteúdo/contagens de registros e vínculos antes/depois.
- [ ] Aprovar individualmente quem deve ser editor/admin; confirmar UUID, cliente e papel anterior. Nenhuma promoção automática.
- [ ] Validar as sessões reais nomeadas e decidir a liberação do gate.
- [ ] Atualizar origin/main, preparar commits e PR de integração após a autorização de avanço.
- [ ] Obter aprovação final antes de merge/publicação.
- [ ] Acompanhar Actions e executar smoke test publicado após essa aprovação.

A reversão segura permanece o congelamento de escrita. Não restaurar automaticamente as políticas antigas vulneráveis nem remover editor do CHECK com vínculos existentes.

## 9. Prontidão e pendências

**Pronto para revisão do código e da homologação. Não pronto para merge/publicação.**

Pendências:
1. Revisão desta entrega e autorização específica da RLS em produção.
2. Backup/inventário de produção atualizados antes da aplicação.
3. Nomeação individual de pessoas reais, caso a operação precise de escrita; nenhuma identidade foi selecionada.
4. Gate operacional permanece falso até aplicação e validação da RLS.
5. Preparação de commits/PR, aprovação final, Actions e smoke test publicado.

Limites do contrato:
- A importação de unidades usa endpoint/backend próprio e não foi rehomologada como parte da RLS comercial. O bloqueio adicionado ao seletor da interface não é prova de autorização dessa API.
- Os registros guardam último autor/horário; não há histórico integral de alterações e a concorrência continua com última gravação vence.
- A diferença de manutenção PostgreSQL documentada permanece 17.6 em produção e 17.11 em homologação; não houve atualização de versão.

Arquivos de apoio: `seguranca-resumo.json`, `preservacao.json`, `arquivos-modificados.json`, logs selecionados e manifestos SHA-256. Credenciais, backups privados, JWTs, chaves administrativas, node_modules e builds não entram no ZIP de fontes.
