# Balanço das entregas UI/UX

Repositório `jonathanmainel/maria-gasolina-dashboard`. Trabalho isolado em `codex/auditoria-ui-ux-completa`, sem usar worktrees de outras conversas. As publicações seguem a autorização incremental posterior ao diagnóstico: uma integração por vez, com a base atualizada após o deploy e a leitura pública de cada entrega.

| Entrega | Achados | PR | Commit integrado | CI da publicação |
|---|---|---|---|---|
| [01 · Navegação](01/README.md) | F01/F02/F09 | [#11](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/11) | `acf5844c8c67890e7e26bc5eb3ea98d3c57db49b` | [607 testes, build/Pages aprovados](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40690144283) |
| [02 · Metas/apresentação](02/README.md) | F03/F04 | [#12](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/12) | `b1103467737289c765c3b190a6cb61e2d96bf34b` | [614 testes, build/Pages aprovados](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40694444935) |
| [03 · Estados por fonte](03/README.md) | F12 | [#13](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/13) | `743ca6fc561bdfe4a8b6d846f4ca11410c7598be` | [624 testes, build/Pages aprovados](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40736973721) |
| [04 · Legibilidade](04/README.md) | F05/F06 | [#14](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/14) | `5970651b08756d49608af19e3bb5f7644c1431f0` | [624 testes, build/Pages aprovados](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40750640374) |
| [05 · Tabelas](05/README.md) | F07 | [#15](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/15) | `465ff9b850913ec8e865b5d6b6fdcbd3e08ca1e8` | [624 testes, build/Pages aprovados](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40875280376) |
| [06 · Origem e marca](06/README.md) | F08/F13 | [#16](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/16) | `91105a3e6d9ad71cad6b633187e58a11473d62f8` | [627 testes, build/Pages aprovados](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40880092346) |
| [07 · Painéis e CSS](07/README.md) | F10/F11/F14 | Em validação | — | — |

Cada relatório acima registra os arquivos alterados, testes locais relevantes, capturas antes/depois, limites e verificação após a publicação. Os contadores na tabela são das execuções completas de CI correspondentes; não são somas de reexecuções locais.

## Homologação e limites

As capturas locais usam exclusivamente transporte interceptado, dados e imagens identificados como controlados e sessões sintéticas. Cobrem desktop, tablet e celular nos seis tamanhos pedidos, tema claro/escuro, teclado, estados e permissões relevantes. Áreas equivalentes a zoom de 125/150% complementam a matriz; não representam zoom nativo.

Após cada merge, a verificação real acessou a aplicação publicada sem credenciais, sessão de usuário ou mocks. Confirmou HTTP 200, arquivos da versão esperada e login sem erros/rolagem horizontal indevida. Na entrega 06, a marca foi confirmada visualmente em desktop/celular e nos dois temas. OAuth real não foi executado.

**A leitura autenticada de produção permanece pendente.** As telas internas não foram homologadas em produção. O estado “publicado” no diagnóstico distingue esse limite de “validado”; F13 foi validado somente quanto à marca do login público. Não houve sincronização, gravação real ou uso de sessão existente.

## Escopo preservado

Não há mudanças em backend, Supabase, banco, RLS, permissões, cron, coletores ou regras de negócio. Indisponibilidade não virou zero ou desempenho fictício. O Orgânico sinaliza a demonstração preexistente.

A frente de previews Meta Ads do PR #10 continua independente. Não foram modificados seleção, extração de frames, armazenamento, atualização seletiva ou coletores. `FrontView.tsx` e a apresentação são arquivos compartilhados: os relatórios 02/04/07 delimitam seus trechos para reconciliação futura, sem antecipar código desse PR.

O [catálogo visual](index.html) reúne as sete entregas. Os [contratos de layout](../UI_CONTRACTS.md) orientam novas alterações e a manutenção dos testes de regressão.
