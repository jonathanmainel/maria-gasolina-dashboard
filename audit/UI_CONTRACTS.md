# Contratos de composição da interface

Registro da entrega 07 (F14), limitado aos componentes revisados na auditoria. Mantemos React, CSS próprio, Recharts e os componentes existentes. Uma troca de framework não resolveria as causas encontradas e aumentaria o risco das entregas.

## Responsabilidades

| Área | Responsável | Contrato |
|---|---|---|
| Navegação e cabeçalho | `Shell.tsx`, `styles.css` | Regiões explícitas; controles alcançáveis; duas linhas até 1600 px e três até 640 px. Abaixo de 980 px a navegação vira gaveta. |
| Diálogos | `ui/popover.tsx` | Foco inicial, ciclo Tab/Shift+Tab, Escape, fundo inerte e retorno ao acionador. O seletor embutido não cria diálogo aninhado. |
| KPIs e resumos | `ui/primitives.tsx`, `styles.css` | Valor, comparação e gráfico ocupam regiões de fluxo. Colunas monetárias respeitam conteúdo; consultas ao contêiner ajustam composições estreitas. |
| Contraste | Tokens de `styles.css`, `useChartColors` | Cores de texto têm papéis distintos das cores decorativas; claro/escuro e impressão usam os respectivos tokens. |
| Painéis empilhados | `.panel-stack` | Altura intrínseca. Somente a composição da Executiva solicita preenchimento com `.panel-stack-fill`. Settings e CRM não distribuem sobra dentro de cada painel. |
| Frentes sem associação | `UnavailableFrontView` | Aviso e funil comercial sempre expostos. Três `details` nativos recolhem somente mídia indisponível; expandir preserva filtros e valores ausentes como “—”. |
| Tabelas | `ui/table-viewport.tsx` | Rolagem nativa local quando necessária; região, foco e aviso condicionados ao transbordamento. Tabela e cabeçalhos mantêm semântica. |
| Fontes e sincronização | `data-sync.css`, componentes de fontes | Estilos do painel e controles. Não sobrepor a geometria global do cabeçalho. Nenhuma mudança no protocolo de sincronização. |
| Apresentação | `presentation.css`, paginação existente | Regras sob `.present.responsive-present`; limites de páginas acomodam metas sem alterar cálculos. |
| Login | `styles.css` | Até 900 px o card mostra a marca; acima desse limite a marca pertence ao painel lateral. |

## Limites e regras móveis

1240 px adapta grades de conteúdo; 980 px adapta navegação e herói; 900 px adapta o painel de login; 640 px adapta cabeçalho, KPIs, tabelas e herói móvel. A apresentação tem seus próprios limites de largura/altura porque precisa caber num slide, enquanto o dashboard permite rolagem. Não unificamos limites de finalidades distintas.

Na entrega 07, as declarações repetidas de `.hero` e `.hero-stats` dentro do mesmo bloco de até 640 px foram reunidas. Preservamos o resultado anterior: herói com mínimo de 340 px, fluxo flexível, estatísticas em uma coluna, ordem e espaçamentos existentes. Não há novo deslocamento absoluto nem `!important`.

`DashboardShell`, `KpiCard` e `DashboardCharts` coexistem com os componentes atuais. A busca de consumidores não justificou sua remoção nesta entrega; coexistência não prova conflito em execução. Evitar apagar ou reescrever componentes sem revisar o grafo de importações e os testes.

## Prevenção de regressões

Os testes `uiux-navigation`, `uiux-pacing`, `uiux-sources`, `uiux-legibility`, `uiux-tables`, `uiux-branding` e `uiux-panels` cobrem os contratos afetados, com transporte local controlado e rede externa bloqueada. As seis resoluções e dois temas têm evidência visual; áreas equivalentes a 125/150% complementam o ensaio e não representam zoom nativo.

Não aceitar uma alteração de referência só porque o teste passou: conferir os PNGs, valores, alinhamentos e estados expandidos. Testes de permissões e dados mantêm seus contratos; nenhum ensaio simulado equivale à homologação autenticada em produção. As entregas e seus limites estão em `releases/` e no diagnóstico.
