# Incremento 05 — homologação real da RLS

Data: 23/10/2026. Resultado: pacote v3 aprovado nos cenários executados no ambiente isolado. Produção não alterada; edição operacional não liberada. Sem commit, staging, push, merge ou deploy.

## Ambiente e custo

- Projeto: **Maria Gasolina | RLS Homologacao I05**, ref `uwafdxsdsgqysjjxfywo`, região us-east-1.
- Organização Jonathan GT+, plano Free. Antes da criação, a cotação da ferramenta retornou `amount: 0`, recorrência mensal; custo confirmado **US$ 0/mês**. O plano permaneceu Free após a criação. Nenhum upgrade, branch de produção ou serviço pago foi habilitado. Esta é a condição verificada nesta criação, não uma promessa de preço futuro.
- Produção: `hlqrpreqvvxtkruwsolg`, acessada somente por SELECT de inventário. Nenhuma alteração nos oito usuários reais.
- Cinco contas Auth sintéticas confirmadas, dois clientes marcados `RLS_SANDBOX_ONLY` e seis vínculos. Senhas aleatórias e configuração de execução guardadas fora do repositório; JWTs apenas em memória. Nenhuma importação de usuários, dados, senhas, tokens ou credenciais reais.
- As contas foram criadas pelo Auth real do projeto, sem envio de convites. Os testes fizeram login de senha no Auth, confirmaram `/auth/v1/user` e usaram os JWTs de usuário comum no PostgREST. Não se usou service role nem assinatura JWT forjada para comprovar autorização.

## Equivalência e diferenças

Antes da RLS, comparou-se o catálogo vivo de produção com a reprodução mínima. Todos os itens selecionados foram idênticos:

| Objeto | Quantidade comparada |
|---|---:|
| Tabelas | 3 |
| Colunas | 18 |
| Constraints | 13 |
| Índices | 7 |
| Políticas | 5 |
| Funções relevantes, incluindo auth.uid nativo | 2 |
| Entradas de grants de tabela | 73 |
| Entradas de grants de coluna | 253 |

Tabelas: `dashboard_clients`, `dashboard_client_users`, `dashboard_manual_inputs`. Também foram conferidos ownership/RLS, schemas e dependências dos helpers. Auth permaneceu nativo do Supabase, sem substitutos.

Diferenças conhecidas: PostgreSQL de produção 17.6.1.166 e sandbox 17.11; dados e identidades sintéticos; tabelas, sincronizações, segredos, cron, APIs e Edge Functions de marketing não foram copiados. A comparação cobre o contrato mínimo necessário à RLS, não é clone ou auditoria integral da plataforma.

O advisor final encontrou um aviso de **proteção contra senhas vazadas desabilitada no Auth do sandbox**. Essa configuração não foi alterada e não muda o resultado dos testes de RLS com senhas sintéticas aleatórias. Não foram encontradas outras recomendações no retorno final desse advisor. Não se afirma homologação geral de Auth.

## SQL aplicado e correção encontrada

O SQL v3 foi aplicado somente no sandbox. Durante a execução, a checagem final PL/pgSQL revelou necessidade de parênteses em `OR (CASE WHEN ... END)`. A tentativa com erro abortou integralmente: CHECK, políticas e ausência do trigger foram conferidos antes de tentar novamente. O arquivo proposto foi corrigido e então aplicado com sucesso, sem mudar o modelo de autorização.

Cópia exata aplicada: `artifacts/incremento05-rls-20261023/rls-v3-aplicado-sandbox.sql`.
SHA-256: `b70a4b39d00df86c13362856d31779d12046cbbec92ec92d81cce2962cb44071`.

O CHECK passa a viewer/editor/admin e aborta se existir manager legado. Não converte nem promove vínculos. As policies `dashboard_manual_inputs_member_insert` e `dashboard_manual_inputs_member_update` são substituídas pelas policies editor/admin do próprio cliente; acrescenta-se DELETE comercial somente para admin, com grant correspondente. SELECT por vínculo e self_select são preservados. Metas/configurações `business` mantêm conteúdo e leitura; editor/admin podem atualizar, nenhum perfil de API pode excluí-las.

O trigger novo, BEFORE INSERT/UPDATE, define autoria e horários no servidor e impede mudanças de ID, cliente, scope e criação da linha. Helpers e validação de envelopes impedem origem demo, frente/escopo/período incoerentes. Grants excessivos de escrita e TRUNCATE nos vínculos são revogados. Nenhuma função de gerenciamento de permissões foi exposta ao navegador.

## Resultados de segurança

| Execução | Resultado | Evidência/contexto |
|---|---:|---|
| SQL de autorização | 56 aprovados | PostgreSQL real, auth.uid nativo e SET LOCAL ROLE; fixture revertida |
| SQL de contratos/payloads | 23 aprovados | Validador aplicado no sandbox real |
| Preflight de manager legado | Aprovado | CHECK legado e vinculo sintetico restaurados temporariamente; abortou sem converter; fixture revertida |
| REST base | 55 aprovados | Auth e JWTs reais |
| REST adicional | 12 aprovados | Metadata adulterada, revogação e isolamento por vínculo |
| REST com escrita congelada | 17 aprovados | Leitura e negação de INSERT/UPDATE/DELETE nos três perfis |
| REST após recuperação | 6 aprovados | Viewer negado; editor insere e admin exclui somente registro temporário |
| REST anônimo adicional | 3 negados como esperado | GET manual, GET vínculos e POST manual |
| Testes do executor | 18 aprovados | Transporte simulado; não são prova de RLS |

As 90 verificações REST autenticadas são a soma das quatro fases, não 90 cenários independentes sem repetição. As três verificações anônimas adicionais também se sobrepõem à cobertura base. Os testes SQL complementam o REST; execução administrativa de setup não conta como autorização de usuário.

Confirmados: viewer lê e não grava; editor lê/insere/atualiza no próprio cliente e não exclui; admin exclui somente registros comerciais válidos do próprio cliente; business não pode ser excluído; outro cliente não pode ser lido ou alterado. INSERT/UPDATE/DELETE e upsert foram exercitados. Negativas com zero linhas foram verificadas por estado antes/depois, sem confundir HTTP bem-sucedido com gravação autorizada.

O mesmo usuário com editor em A e viewer em B continuou gravando apenas A. Alterar user_metadata para admin não promoveu o viewer. Rebaixar editor para viewer no banco negou a próxima escrita com o mesmo JWT ainda válido. Tentativas de forjar updated_by/horários, trocar client_id/scope/ID/criação, alterar o próprio papel, usar origem demonstrativa ou resultados sem período válido foram bloqueadas ou normalizadas pelo servidor conforme o contrato. Todos os dados são sintéticos.

## Reversão, recuperação e estado final

O congelamento revoga INSERT/UPDATE/DELETE dos papéis de API e adiciona três policies restritivas de negação; preserva SELECT, papéis, funções, trigger e dados. Foi ensaiado com sessões reais. A recuperação foi ensaiada somente no sandbox marcado, removendo as três barreiras e restaurando os grants revisados; não restaura as antigas policies vulneráveis.

Antes/depois do congelamento e recuperação: **oito registros e seis vínculos preservados**. Fingerprint dos registros, calculado com `md5(jsonb_agg(to_jsonb(linha) order by id)::text)`: `26a044cfa154672bcea736a43964a49b`, idêntico nas conferências. O smoke test de recuperação criou e excluiu somente uma linha adicional temporária, sem alterar as oito existentes.

Ao concluir, o congelamento foi reaplicado com sucesso. Estado final do sandbox: SELECT concedido, escrita negada, três barreiras restritivas, oito registros preservados e cinco contas sintéticas. Não houve descarte/pausa automático do projeto; aguardar decisão sobre retenção e remoção do ambiente e de suas credenciais.

## Frontend e arquivos alterados nesta homologação

| Arquivos | Motivo |
|---|---|
| `src/lib/commercial-access.ts` e teste | Reconhecer exatamente viewer/editor/admin; legado/desconhecido sem escrita; gate operacional preservado falso |
| `src/lib/commercial-data.test.ts`, `commercial-records.test.ts`, `src/views/Sales.test.tsx` | Alinhar perfis dos testes ao contrato editor |
| `src/components/ui/editable.tsx` | Modo somente leitura e fechamento de rascunho após perda de permissão |
| `src/views/Settings.tsx`, `src/pages/Dashboard.tsx` | Reutilizar autorização compartilhada em Metas e conteúdos manuais |
| `src/lib/manual-inputs.ts` e `manual-commercial.test.ts` | Revalidar sessão/vínculo no salvamento; erro remoto não vira sucesso local operacional; demo continua só local |
| `src/views/Settings.permissions.test.tsx` | Oito testes de leitura, autorização, gate e revogação |
| `e2e/settings-permissions.spec.ts` | Metas demo desktop/mobile, persistência isolada e ausência de overflow |
| `docs/incremento-05/rls-proposta.sql` | Corrigir sintaxe encontrada na aplicação isolada |
| `homologacao-schema-base.sql`, `homologacao-reabertura.sql`, `testes-rls-rest-adicionais.mjs` | Reprodução fiel, recuperação e cenários adicionais isolados |
| `proposta-rls.md`, `homologacao-supabase.md`, `arquitetura.md`, este relatório | Registrar resultados, limites e procedimento de produção |

As alterações funcionais anteriores continuam pendentes na mesma branch. Os scripts de homologação não são migrations de produção e não devem entrar em execução automática. Artefatos em `artifacts/` são locais/ignorados. Não incluir configuração privada, screenshots, logs ou credenciais no futuro staging.

A prévia comercial e o demo continuam identificados e isolados; funis Places/Expansão, filtros, comparação e apresentação não foram refeitos nesta etapa. **COMMERCIAL_ACCESS_POLICY_READY continua false**, inclusive para Metas. Nenhum viewer foi promovido. O controle aqui cobre registros manuais e seus campos de metas/conteúdos; cadastro/importação de unidades usa contrato próprio e não foi re-homologado por estas policies.

## Validação local

- TypeScript aprovado.
- 544 testes unitários/componentes em 41 arquivos aprovados.
- 18 testes locais do executor REST aprovados, separados da homologação remota.
- 44 testes E2E aprovados; produção local e demo compilados; quatro testes de empacotamento aprovados.
- Apresentação: cinco slides em 1920×1080, 1600×900, 1366×768, 1280×720, 3840×2160, 2560×1080, 3440×1440, 1100×650 e 390×844; redimensionamento, fullscreen, navegação, valores íntegros e limites de cards verificados pelo navegador. Capturas locais geradas, incluindo Metas desktop/mobile. Galeria local: artifacts/incremento05-rls-20261023/capturas.html.
- Primeiro E2E: 40 passaram e quatro falharam. O demo herdou configuração de Supabase de `.env.local`; a fixture bloqueou as tentativas externas. Houve também dois timeouts de gráficos sob concorrência. Rebuild com URL/chave Supabase vazias apenas no processo e repetição com um worker resultaram em 44/44, sem mudar aplicação, expectativas ou timeouts. Configurações privadas e configuração raiz do Playwright preservadas.
- As verificações de console dos cenários finais não encontraram erros não esperados.
- Builds mantêm aviso existente de chunks acima de 500 kB; não se ampliou escopo para refatoração.
- 78 arquivos de integrações/configuração/segurança selecionados comparados por SHA-256 com o inventário anterior: inalterados. Inclui API, métricas, Auth, cliente Supabase, Edge Functions, migrations e workflow. Dados de marketing não receberam nenhuma escrita; carregamento real de Meta/Google/GA4 não foi re-homologado por E2E demo.

Evidências locais: `artifacts/incremento05-rls-20261023/resultado-seguranca.json`, `ambiente-e-equivalencia.json`, `testes-sql-executados.sql`, logs REST/local e screenshots. Nenhuma evidência pública contém senhas ou JWTs.

## Produção: confirmação e pendências

Última conferência somente de leitura: oito membros/todos viewer, zero registros manuais, CHECK ainda viewer/manager/admin, DELETE não concedido e nenhum trigger de usuário na tabela manual. **As policies atuais de produção ainda autorizam INSERT/UPDATE por associação ao cliente. O bloqueio do frontend não corrige esse acesso direto à API.** O pacote homologado precisa de aprovação e aplicação separadas para eliminar esse risco.

A homologação em projeto isolado não libera produção automaticamente. Também permanecem pendentes: decisão nominal dos primeiros editores/administradores, backup privado recuperável da produção e aprovação do gate/publicação. A camada existente só guarda último autor/horário; não é histórico completo e mantém última gravação vence. Owner/service_role continuam privilegiados por desenho da plataforma. Grants de outras tabelas fora do contrato não foram endurecidos neste incremento.

## Ordem proposta de aplicação e recuperação — não executada

1. Aprovar este resultado, o SQL exato e a janela de alteração em produção. Indicar nominalmente pessoa/UUID, cliente e papel; não escolher automaticamente nenhum dos oito viewers. Aprovação de admin separada da necessidade de edição.
2. Manter frontend bloqueado. Capturar backup privado de DDL, grants, policies, funções, constraints, triggers e registros/vínculos afetados; conferir legibilidade e recuperação. O ensaio sintético não substitui backup da produção.
3. Repetir inventário read-only: confirmar ausência de manager legado, políticas/constraints/grants esperados, novos vínculos ou dados inesperados e comparar com o backup. Divergência relevante exige revisão antes de aplicar.
4. Operador autorizado aplica somente `rls-proposta.sql` revisado em transação integral. Sem fixtures, criação de contas de teste, integrações ou importação do sandbox em produção. Interromper no primeiro erro; conferir rollback se abortar.
5. Conferir CHECK, grants, trigger e policies; dados e vínculos devem permanecer preservados. Testar leitura com sessão real de viewer sem criar números de teste operacionais.
6. Nomear só os usuários aprovados usando `rls-nomeacao-modelo.sql`, com client_id + UUID + papel anterior e expectativa de exatamente uma linha. Guardar antes/depois privadamente. Não promover lista inteira nem confiar em metadata.
7. Homologar sessão autenticada dos nomeados e viewer, com procedimento aprovado e sem gravações de teste em dados reais. Só então aprovar alteração do gate e publicação, em etapa própria.
8. Se houver problema: manter gate bloqueado e, mediante autorização, aplicar `rls-reversao-segura.sql`. Preservar leitura e dados; negar escrita. Não restaurar as antigas policies amplas nem remover editor do CHECK com vínculos existentes. Diagnosticar/retestar correção em sandbox antes de reabrir.

Não executar rollback de dados, novas concessões, remoção do projeto ou publicação sem autorização específica. A futura API Elo exigirá contrato de origem/ingestão separado; este pacote aceita origem manual e não contém endpoints fictícios.
