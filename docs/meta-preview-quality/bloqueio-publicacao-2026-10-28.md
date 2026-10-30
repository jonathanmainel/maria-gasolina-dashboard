# Publicação do PR #10 — bloqueio no despacho seletivo

> Registro histórico. A extensão seletiva foi autorizada e homologada; o frontend
> foi publicado separadamente no PR #19. Estado atual e gate de produção em
> [publicação simplificada de 29/10](publicacao-simplificada-2026-10-29.md).

28/10/2026. **Publicação interrompida antes de qualquer deploy ou gravação remota.**
O responsável determinou que os lotes usem exclusivamente as reservas legítimas
e o coordenador existentes, e que uma alteração desse protocolo exija aprovação
específica. O mecanismo de previews foi preservado; não se reiniciou a auditoria
dos 33 restantes, que são uma entrega independente.

## Estado verificado

- Worktree exclusiva `work/meta-creative-preview-quality`; nenhuma alteração na
  worktree da auditoria de UI/UX.
- `origin/main` atualizado para `743ca6fc561bdfe4a8b6d846f4ca11410c7598be`.
  Contém os PRs #11, #12 e #13 já integrados. Nenhuma branch incompleta foi usada.
- Main integrada à branch do PR #10, sem conflitos, no commit `357ec2c`.
  Isso não integra o PR #10 à main nem publica a aplicação.
- Diff contra a main continua restrito aos previews e suas evidências/testes.
  Guard/reserva do #8, coordenador, cron e coletores Google/GA4 não foram alterados.
- Após atualizar a base: **624 testes frontend e 172 backend aprovados**.
- Produção e homologação isolada acessíveis e com estado `ACTIVE_HEALTHY`.
- `sync-meta-ads` em produção: versão **16**, JWT gateway `false`, import map
  habilitado, hash do pacote `1d3b927352e7079891c2a1ba4de6dd38624d0bb4493967d9c1f2c0fd8c9313e6`.
  Coordenador: versão **11**. Entrada manual: versão **1**.
- Em homologação, o coletor Meta ainda é versão 2, com o adapter antigo de
  provedores. Tabela de previews existe; bucket `dashboard-creatives` ainda não
  existe. O empacotador antigo precisa incluir `preview-media.ts`, importado
  pela nova implementação. Nada foi publicado/criado para mascarar esse estado.

## Bloqueio comprovado no código realmente publicado

As versões remotas de `request-dashboard-sync`, `sync-dashboard-daily` e suas
dependências foram lidas no Supabase. O contrato do banco foi consultado apenas
por leitura e confirma as assinaturas e colunas descritas abaixo.

1. `parseManualRequest`, em `_shared/sync-control.ts`, aceita apenas `action`,
   `client_slug`, `sources`, `request_key` e `run_ids`. A inclusão de
   `preview_ad_ids` faz a entrada rejeitar a solicitação.
2. `request_dashboard_sync` aceita somente cliente, usuário, fontes e chave da
   solicitação. A reserva não tem finalidade de operação nem payload imutável
   de anúncios/arquivos aprovados. Não existe campo apropriado para transportar
   esse lote pelo contrato atual.
3. `runReservedSync`, em `sync-dashboard-daily/runner.ts`, envia somente
   `client_slug`, intervalo, `dry_run=false` e `automation_run_id`. Não encaminha
   IDs de anúncios nem o modo exclusivo de previews ao coletor.
4. O mesmo runner só confirma sucesso quando `database_write_status` é
   `success`, `already_processed` ou `no_data`. A execução seletiva do PR #10
   conserva esse campo nulo porque não escreve métricas; mesmo com HTTP 200 e
   previews persistidos, o runner classificaria o resultado como
   `indeterminate / SYNC_RESULT_UNCONFIRMED`.

A API Meta do PR #10 aceitar IDs não resolve o transporte pelo coordenador nem
o contrato terminal. A reserva legítima atual representa uma sincronização de
métricas. Não será usada uma chamada paralela ao coletor, uma corrida com o
coordenador, uma reserva forjada/reutilizada ou uma edição direta de linhas para
transformá-la numa autorização de outro tipo.

Dois testes locais reproduziram a rejeição do payload e a ausência do despacho/
confirmação terminal, usando o código atual e transportes controlados. Passaram
como testes do **bloqueio**, não como homologação integrada ou sucesso de
publicação. Nenhum endpoint remoto foi executado por esses testes.

## Alteração mínima proposta, ainda não autorizada/implementada

É necessário aprovar explicitamente uma extensão do protocolo existente:

1. Reservar uma operação Meta exclusiva de previews, preservando `metrics` como
   comportamento padrão para os chamadores existentes. Persistir a finalidade e
   o payload imutável do lote, incluindo IDs, identidade e hashes aprovados.
   O schema atual não possui esse armazenamento: isso exige migration restrita
   e aprovação específica, sem reutilizar campos de resultado para esconder intent.
2. Validar o pedido na entrada já autenticada: administrador autorizado, cliente/
   conta corretos, seleção limitada e somente Meta. Não criar endpoint privilegiado
   paralelo nem permitir alteração dos parâmetros após reservar.
3. Fazer o coordenador encaminhar o modo e os IDs da reserva ao coletor. Vincular
   o início da coleta à finalidade/payload reservado, mantendo a exclusão, a
   autenticidade e o comportamento existente de `authorizeCollection`. Qualquer
   ajuste necessário nesse guard precisa estar incluído na aprovação específica.
4. Acrescentar um resultado terminal próprio de previews, confirmado por anúncio,
   persistência e CAS. Sucesso sem regravar métricas deve ser confirmável, enquanto
   falha, timeout e estado indeterminado continuam retendo as proteções existentes.
5. Homologar essa extensão e o pacote completo da função em `uwafdxsdsgqysjjxfywo`,
   usando exclusivamente dados/credenciais de teste. Repetir os testes solicitados
   antes de qualquer publicação. Não mudar cron, secrets, RLS ou coletores Google/GA4.

Este é um plano para decisão, não uma migration pronta para execução. Não foram
alterados schema, RPCs, guards ou coordenador para antecipar essa aprovação.

## Evidência privada e reversão

`artifacts/meta-preview-publicacao-20261028/` é ignorado no Git. Contém a cópia
completa de `sync-meta-ads` v16 para rollback, o código dos outros dois pacotes
publicados e a reprodução local do contrato (`dispatch-proof.*`). As consultas
não copiaram secrets de produção para homologação. Nenhum arquivo de Storage,
metadata de preview, métrica ou configuração real foi alterado.

O manifesto definitivo dos dez, a comparação atual do Storage e o dry run remoto
continuam pendentes da resolução do gate. A evidência anterior dos candidatos
está preservada, e o CTV 1 — Depoimento permanece fora do lote de substituições.

## Situação das etapas

| Etapa | Situação |
| --- | --- |
| Mecanismo HD/Full HD implementado | Sim, preservado no PR #10 |
| Base atualizada e novos testes frontend/backend | Sim |
| Despacho seletivo pelo protocolo autorizado | Bloqueado; extensão requer aprovação |
| Homologação integrada completa no Edge Runtime | Pendente; não certificada por mocks |
| Deploy de produção / merge do PR #10 | Não executados |
| Atualização real de previews | Nenhuma |
| Validação visual em produção | Pendente |
| Outros 33 anúncios | Entrega independente, sem bloquear os dez por sua auditoria |

O impedimento desta entrega é o protocolo de despacho seletivo, e não a
investigação dos outros 33 anúncios.
