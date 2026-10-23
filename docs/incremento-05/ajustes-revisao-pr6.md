# Incremento 05 — ajustes de segurança da revisão do Draft PR #6

23/10/2026. Escopo aprovado: corrigir confirmação de gravação, separar o bloqueio de importação e ajustar o texto de compartilhamento. Commit/push exclusivamente em `codex/incremento-05-integracao`; PR continua em rascunho. Sem SQL, alteração de usuários/vínculos, merge ou deploy.

## Confirmação de persistência

Vendas e Metas/configurações manuais agora solicitam `client_id,scope,payload` no retorno do `upsert`. A aplicação só confirma o salvamento se receber exatamente um registro com os três campos correspondentes. A comparação é do payload JSON completo, sem normalizar um retorno divergente para fazê-lo parecer correto. A ordem das chaves de objetos JSON é desconsiderada; valores, campos e ordem de arrays continuam relevantes.

Isso usa a representação retornada pelo banco na própria requisição de escrita, após as políticas/triggers aplicáveis. Não é uma segunda consulta que poderia observar outra gravação concorrente. A representação não substitui a RLS nem cria histórico de auditoria. O fluxo futuro depende também da política legítima de SELECT, já prevista no pacote homologado.

Retorno nulo/vazio, mais de uma linha, cliente/scope incorretos ou payload divergente geram falha de confirmação. Erros RLS/rede continuam propagados. Uma falha de confirmação não prova que a escrita não ocorreu: a interface informa a impossibilidade de confirmar e mantém o rascunho, sem anunciar sucesso. Antes de repetir uma tentativa operacional incerta, conferir o registro autorizado. O modelo existente de concorrência continua com última gravação vence.

O cache local de `business` só é atualizado depois da confirmação. O cache de consulta comercial continua sendo invalidado pelo `onSuccess`; uma mutação rejeitada não aciona esse caminho. As chaves, a composição dos formulários e a persistência demo em armazenamento local separado não mudam. Nenhum dado de exemplo é enviado ao Supabase operacional.

## Importação de unidades

`NETWORK_UNITS_IMPORT_READY = false` é uma trava própria. O fieldset permanece indisponível mesmo se o papel tiver `canEdit` e o gate comercial for liberado futuramente. O aviso explica a homologação pendente. A trava também vale para a interface demonstrativa.

Nenhuma alteração no componente/serviço de importação, endpoint ou suas permissões. O bloqueio da interface não comprova autorização desse backend. Sua revisão continua separada; não liberar essa flag junto com Vendas/Metas por conveniência.

## Compartilhamento

O link existente adiciona `?share=1`; esse parâmetro oculta controles da interface. O fluxo operacional continua passando por autenticação e vínculo autorizado. Removidas as promessas de abertura sem conta e de token assinado revogável. O texto informa o login obrigatório com conta autorizada. Não foi criado sistema de compartilhamento público, token ou alteração em Auth/rotas. O modo demonstrativo continua com seu comportamento já existente.

## Verificações

Os 55 testes diretamente afetados passaram na checagem inicial: confirmação válida, respostas vazias/nulas/múltiplas/divergentes, erro RLS, preservação dos caches/rascunho, autorização por papel, importação bloqueada e textos corretos. A cobertura inclui o SDK Supabase instalado com transporte HTTP controlado, conferindo `Prefer: return=representation`, e os salvadores reais do aplicativo com respostas simuladas.

As verificações finais no HEAD enviado incluem TypeScript, suíte unitária/componentes, build e regressões essenciais de Vendas, Metas, navegação e apresentação. Há teste de navegador de que `share=1` sem demonstração continua redirecionando uma pessoa não autenticada ao login. O SHA e as contagens finais constarão no relatório externo e no corpo do PR; não devem ser confundidos com a homologação remota anterior.

Os novos testes não gravam no Supabase: exercitam respostas controladas e demo com rede externa bloqueada. Não foi reaberto o sandbox congelado nem executado SQL para provar uma nova escrita remota. A homologação real de RLS previamente aceita permanece registrada nos relatórios históricos. Antes de liberar produção, a verificação controlada deverá também exigir uma representação correta do salvamento autorizado.

## Preservação e pendências

- `COMMERCIAL_ACCESS_POLICY_READY = false` e `NETWORK_UNITS_IMPORT_READY = false`.
- SQLs v3, reversão, nomeação e fixtures preservados; sem execução nesta etapa.
- Sem alterações em Auth, rotas protegidas, API de mídia, recarga, previews, apresentação publicada, backend de unidades, dependências, Edge Functions, migrations ou workflow.
- Preservar PRs #3–#5, os dez worktrees anteriores e alterações alheias; excluir credenciais e snapshots do Git.
- Permanecem pendentes revisão final, inventário/backup atualizados, autorização/aplicação/verificação da RLS, nomeações individuais quando aprovadas, liberação revisada da edição e aprovação separada de merge/publicação.

Referência do contrato do cliente: [Supabase JavaScript upsert](https://supabase.com/docs/reference/javascript/upsert). O código da versão instalada foi conferido; não houve troca de versão ou dependência.
