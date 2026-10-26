# Incremento 05 — revisão pré-publicação

26/10/2026. A RLS v3 já foi aplicada e validada, e a primeira nomeação administrativa foi concluída por autorização nominal em registro privado. Esta revisão libera o gate comercial e prepara o PR #6; não autoriza merge, deploy, alteração de políticas/vínculos nem escrita de validação em produção.

Este documento atualiza o estado de entrega descrito nos relatórios históricos. Os scripts v3 homologados permanecem intactos. O relatório `integracao-homologacao-final.md` registra as evidências e a resolução dos 15 caminhos sobrepostos; suas referências a “sem commits/PR” descrevem a etapa anterior.

A regra local `docs/incremento-05/.gitattributes` desativa a conversão de quebras de linha somente para os SQLs dessa pasta. Isso preserva seus bytes e hashes homologados também nos blobs do Git, independentemente da configuração do checkout.

## Base e escopo

- Base remota conferida: `c75db340ca4224f1d0e8d3e0b5c32738a774cfcf`, incluindo os PRs #3, #4 e #5.
- Checkout separado, preservando os dez worktrees anteriores e suas alterações.
- Cinco frentes, dois modelos comerciais, registros por cliente/frente/natureza e resultados vinculados ao intervalo exato.
- Preservados recarga compacta/horário, criativos, apresentação responsiva paginada e gráficos de mídia independentes dos exemplos.
- Nenhuma alteração em dependências, Auth, API de mídia, Edge Functions, migrations ou workflow. Google Ads e miniaturas de vídeo permanecem fora do escopo.
- `COMMERCIAL_ACCESS_POLICY_READY = true`: esta versão libera edição somente conforme o vínculo atual; não altera permissões no banco. `NETWORK_UNITS_IMPORT_READY = false` permanece.
- O workflow existente publica somente em push de `main` ou acionamento manual. Push da integração e abertura do Draft PR não acionam esse deploy.

## Impacto das permissões

| Área | Antes da liberação | Depois de RLS validada e gate aprovado |
|---|---|---|
| Vendas | Operação somente leitura para todos; prévia comercial disponível | viewer consulta; editor/admin inserem e atualizam; somente admin exclui um registro comercial confirmado |
| Metas | Valores preservados, editor indisponível | viewer consulta; editor/admin alteram `business`; nenhum perfil exclui metas |
| Configurações manuais/conteúdos | Mesmo bloqueio de Metas | Mesmo contrato de escrita `business`, sem DELETE |
| Importação de unidades | Trava própria `NETWORK_UNITS_IMPORT_READY = false` | Continua indisponível mesmo após liberar Vendas/Metas; endpoint e permissões precisam de homologação separada |
| Preferências locais e compartilhamento | Continuam disponíveis | Não concedem acesso ao banco |
| Exemplos comerciais | Identificados, reversíveis, sem gravação operacional | Permanecem disponíveis; prévia não permite edição/exclusão operacional |

Antes de cada gravação comercial ou de `business`, o cliente revalida sessão e vínculo. A RLS é a autoridade final; esconder controles não corrige as políticas antigas. INSERT/UPDATE exigem uma única linha retornada com cliente, scope e payload iguais aos enviados; a ordem das chaves JSON não interfere. Retorno vazio/nulo, múltiplo ou divergente impede confirmação, mensagem de sucesso e atualização de caches. Erros remotos não viram sucesso local operacional. DELETE exige cliente e scope exatos e a representação de uma linha. `business` nunca é alvo da exclusão comercial.

O modo global demo usa armazenamento local separado. Os exemplos de Franquias e Condomínios não substituem os gráficos operacionais de canais/meses; Empresas, Academias e Hospitais não recebem números inventados. O consolidado executivo identifica seu escopo atual de Franquias e Condomínios.

## Ajustes solicitados na revisão do Draft PR #6

- Persistência de Vendas e `business`: `upsert(...).select("client_id,scope,payload")`, com confirmação estrita da representação do banco antes de concluir a mutação. O caminho demo, os formulários, as chaves e a política de atualização dos caches permanecem iguais.
- Importação de unidades: gate próprio falso, independente do gate comercial e do papel. Interface indisponível inclusive no demo; a função do frontend também recusa chamadas diretas enquanto a trava estiver falsa. Nenhum endpoint ou permissão do backend foi alterado.
- Compartilhamento: `?share=1` muda somente os controles visíveis. Na operação, login e vínculo autorizado continuam obrigatórios. Não existe token público assinado/revogável nesse link; os textos foram corrigidos. Não foi implementado acesso público.
- `COMMERCIAL_ACCESS_POLICY_READY = true`, após autorização específica. A RLS v3 e todos os SQLs homologados continuam sem alteração nesta revisão.

Detalhes, cobertura e limites em [ajustes-revisao-pr6.md](./ajustes-revisao-pr6.md). As contagens finais e o HEAD validado ficam no relatório de entrega e no corpo do Draft PR.

## Referência histórica do pacote de produção — já aplicado, não repetir nesta etapa

As listas e instruções de aplicação abaixo documentam o procedimento anterior. Os requisitos foram concluídos; não são novas pendências desta liberação.

| Arquivo | SHA-256 homologado |
|---|---|
| `rls-proposta.sql` | `b70a4b39d00df86c13362856d31779d12046cbbec92ec92d81cce2962cb44071` |
| `rls-reversao-segura.sql` | `0ae31342f60dfff12e2dc14fddce9b7efc26091513e7c4a74228eff97e56cc09` |

O último inventário de produção registrou oito vínculos viewer, nenhum manager em outros clientes e nenhum registro manual. Isso é histórico, não uma confirmação do estado atual. PostgreSQL: produção 17.6; homologação 17.11. Conferir novamente antes de uma mudança autorizada.

### Pré-aplicação

- [ ] Revisão do Draft PR e autorização específica do responsável para SQL de produção.
- [ ] Confirmar conexão e projeto `hlqrpreqvvxtkruwsolg`; nunca usar bootstrap, fixtures, testes ou reabertura do sandbox em produção.
- [ ] Inventariar todos os clientes/vínculos, inclusive `manager` globalmente, dados manuais, RLS, policies, grants efetivos de tabela/coluna e herdados, CHECK, índices, funções e triggers. Divergência relevante exige interromper e avaliar antes de executar.
- [ ] Capturar snapshot privado recuperável com dados, sequência, DDL, policies, ACL, funções, triggers e dependências; restringir acesso e conferir hashes. Ensaiar a restauração desse snapshot atualizado no ambiente isolado. O ensaio anterior não equivale a uma restauração integral de Auth.
- [ ] Comparar inventário com backup e com os pré-requisitos do v3; manter os oito viewers e o gate falso.
- [ ] Conferir hash e conteúdo do SQL exato aprovado. Não incorporar mudanças posteriores sem avaliação/homologação.

### Aplicação e verificação após autorização futura

1. Operador autorizado executa somente `rls-proposta.sql`, em sua transação integral e com interrupção no primeiro erro. Os timeouts/locks do pacote limitam a espera; uma falha antes do COMMIT exige ROLLBACK, sem execução parcial deliberada.
2. Comparar dados/vínculos antes e depois por conteúdo, não só contagem. Nenhum usuário é promovido pelo pacote.
3. Conferir CHECK viewer/editor/admin; substituição efetiva das antigas policies permissivas de escrita; SELECT legítimo preservado; grants, helpers e trigger habilitado. Autoria deve vir de `auth.uid()` no servidor; `id`, `client_id`, `scope` e `created_at` devem permanecer protegidos.
4. Conferir permissões efetivas por perfil/cliente: viewer sem escrita; editor/admin com INSERT/UPDATE autorizados; DELETE só comercial e só admin; metas/configurações sem DELETE; vínculos sem alteração direta pela API. Sucesso HTTP com zero linhas não comprova gravação: exigir retorno esperado e releitura. Não criar contas nem dados fictícios na produção. Qualquer teste que exija gravação real precisa de alvo e autorização próprios; evidência do sandbox não substitui a conferência de produção.
5. Somente após essas verificações e revisão do resultado, decidir separadamente a liberação do gate e as identidades operacionais. Este PR mantém o gate falso e não prepara merge automático.

### Reversão segura após autorização futura

- Antes do COMMIT: ROLLBACK da transação; conferir que o estado anterior permaneceu intacto.
- Depois do COMMIT: manter/bloquear a edição da interface e, mediante autorização específica, executar o arquivo homologado `rls-reversao-segura.sql`. Ele congela escrita com revogação de grants e três policies restritivas; preserva SELECT, registros, vínculos, novos papéis e proteção de autoria.
- Conferir grants efetivos e as três barreiras; viewer/editor/admin devem permanecer sem escrita. Conferir conteúdo, sequência, leitura legítima e ausência de alterações não previstas.
- Não restaurar policies antigas que autorizavam viewers, não remover `editor` do CHECK enquanto houver vínculos e não sobrescrever dados com snapshot automaticamente. Uma restauração estrutural/dados é outra operação, sob bloqueio e autorização específica.
- Se o congelamento falhar, suspender outras atividades, informar o estado e executar somente o plano de recuperação aprovado. A reabertura de sandbox não é procedimento autorizado para produção.

## Nomeação individual — primeira nomeação concluída

Estado agregado confirmado por leitura: 1 admin, 7 viewers e 0 editores. Identidade e evidências permanecem em registro privado fora do Git. A lista abaixo permanece como referência para eventuais nomeações futuras, sempre sob autorização nominal.

- [ ] Responsável identifica nominalmente quem precisa escrever e qual papel precisa: editor para preenchimento; admin também permite excluir registros comerciais.
- [ ] Aprovar cada pessoa separadamente, incluindo admin; registrar justificativa, autorizador, operador e data em controle privado.
- [ ] Confirmar UUID no Auth, cliente `1`/slug `maria-gasolina`, vínculo existente e papel anterior. Não confiar apenas em nome/e-mail de exibição. Não versionar lista nominal ou UUID real.
- [ ] Aplicar e validar primeiro a RLS; guardar cópia privada do vínculo anterior.
- [ ] Usar `rls-nomeacao-modelo.sql` apenas com autorização nominal, uma pessoa por transação, filtros de UUID + cliente + papel anterior e exatamente uma linha afetada. O modelo mantém UUID NULL para impedir execução acidental.
- [ ] Conferir o vínculo final, todos os demais vínculos inalterados e sessão da pessoa aprovada. Não usar metadados Auth para conceder permissão.
- [ ] Documentar revogação individual com os mesmos filtros e expectativa de papel atual; não rebaixar o último admin sem decisão do responsável.

Nenhuma nomeação adicional está autorizada. Identidade, cliente e papel anterior devem ser confirmados privadamente antes de uma futura alteração.

## Verificações desta revisão

As verificações locais serão executadas no HEAD final antes do push. O SHA, os resultados e a relação completa de arquivos constarão no corpo do Draft PR e no relatório externo de entrega, evitando um commit posterior que invalide a referência testada.

Os testes autenticados aceitos do sandbox estão em `integracao-homologacao-final.md`: 92 verificações nas fases REST, incluindo repetições e cinco verificações anônimas, zero falhas finais; oito registros e seis vínculos restaurados, policies/grants equivalentes ao snapshot e escrita recongelada. Não foram reexecutados testes remotos nem acessada produção nesta revisão.

Credenciais, snapshots privados, JWTs, chaves administrativas, capturas e logs de execução ficam fora do Git. Os scripts públicos recebem configuração privada externa e não carregam contas reais. A revisão inclui varredura dos arquivos candidatos a commit.

Pendências desta etapa: concluir os testes da liberação, atualizar o PR e obter autorização final para merge/publicação; depois, conferir Actions e o comportamento publicado. Não repetir a homologação da RLS, os backups ou a recuperação já aprovados. Permanecem os limites de última gravação vence, sem histórico integral de alterações, e do backend independente da importação de unidades.
