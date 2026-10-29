# Maria Gasolina — auditoria de UI/UX e responsividade

Data do diagnóstico: 28/10/2026. As seções 1–7 preservam a evidência da etapa inicial, anterior às correções. O acompanhamento aprovado está na seção 8.

**Resultado:** a interface exige correções de composição e acessibilidade, principalmente no cabeçalho, no seletor de período, nos indicadores de metas e na apresentação em celular. A ausência de overflow global não demonstrou boa legibilidade. Foram registrados **14 achados: nenhum P0, quatro P1, sete P2 e três P3**.

## 1. Base, isolamento e limites da evidência

- Repositório: `jonathanmainel/maria-gasolina-dashboard`.
- Base exata: `37f3d785f0a1d6a41830252babbba113609df39f`, confirmada como `origin/main` no clone independente. Contém os merges dos PRs #8 e #9.
- Branch local: `codex/auditoria-ui-ux-completa`.
- Worktree: `C:\Users\GAMER\Documents\ChatGPT\Profissional\work\auditoria-ui-ux-completa`.
- Clone de apoio independente: `work/auditoria-ui-ux-base`. Nenhuma worktree de outra conversa foi utilizada como base ou alterada. A criação gerenciada pelo aplicativo não aceitou o clone como `sourceRoot`; a worktree foi criada pelo Git nesse clone independente.
- Servidor Vite local: `http://127.0.0.1:5196`. URL de API de teste: `http://127.0.0.1:55498`, interceptada em memória pelo Playwright; não existe serviço de produção por trás dessa URL.
- Chrome via Playwright, viewport em pixels CSS, temas claro/escuro, movimento reduzido e data local controlada em 28/10/2026. Os números de mídia e imagens de criativos são **fixtures sintéticas de teste**. As frentes Empresas, Academias e Hospitais continuam indisponíveis. Os exemplos orgânicos preexistentes continuam sinalizados como demonstração.
- Nenhuma sessão ou credencial real foi usada. Login, vínculo e perfis foram simulados. Nenhum banco, função, coletor, métrica, regra de negócio, RLS, permissão ou implementação de preview foi alterado. Nenhuma coleta ou gravação real ocorreu.
- Não houve commit, push, PR, merge ou deploy. O PR Draft de correções é uma etapa posterior à aprovação.

**Não validado em produção:** autenticação Google/Supabase real, autorização efetiva do servidor, dados reais, reprodução de mídia real, resposta dos provedores ou sincronização real. Capturas de uma tela autenticada com fixture demonstram sua renderização local, e não seu acesso autenticado em produção. Não foram utilizados dispositivos físicos, Safari/iOS ou teclado virtual de celular. Impressão/PDF e os diálogos do sistema operacional não fazem parte da homologação deste pacote.

## 2. Inventário e matriz visual

As **156 capturas principais** são 13 telas/estados × seis resoluções × dois temas. Cada linha abaixo possui os seis tamanhos em dark e light. O nome do PNG informa o viewport; a altura do arquivo pode ser maior por ser captura integral da página.

| Tela/estado | Acesso local | Componentes examinados | Evidência |
|---|---|---|---|
| Visão Executiva | `?view=executive` | Cabeçalho, KPIs, tendências, cards de frentes, mapa vazio e populado, metas, gráficos, CRM vazio | [Capturas](evidence/executive/) · [Mapa populado](evidence/probes/map-390-light.png) |
| Places — Condomínios | `?view=condominium` | Filtros, KPIs, gráficos, metas, plataformas, detalhamento, Top 3/9, funil | [Capturas](evidence/condominium/) |
| Places — Empresas | `?view=company` | Indisponibilidade, filtros, espaços reservados, detalhamento, funil | [Capturas](evidence/company/) |
| Places — Academias | `?view=gym` | Mesmos componentes da frente indisponível; navegação própria | [Capturas](evidence/gym/) |
| Places — Hospitais | `?view=hospital` | Mesmos componentes da frente indisponível; navegação própria | [Capturas](evidence/hospital/) |
| Expansão — Franquias | `?view=franchise` | KPIs, séries, metas, plataformas, detalhamento, criativos e funil | [Capturas](evidence/franchise/) |
| Comparação entre frentes | Botão em uma frente de Places | Seletores A/B, prevenção de frente repetida, plataforma comum, indicadores, ausência de série comparável, tabela | [Capturas](evidence/comparison/) |
| Orgânico | `?view=organic` | Aviso de demonstração, Instagram/Facebook, KPIs, curva, conteúdos, posts, interações | [Capturas](evidence/organic/) |
| Site / GA4 | `?view=site` | KPIs, gráfico combinado, aquisição, canais, landing pages, eventos e tabelas expansíveis | [Capturas](evidence/site/) |
| Vendas / CRM | `?view=crm` | Categorias/frentes, origem do dado, ausência de registros, editores, funis ilustrativos, mídia separada | [Capturas](evidence/crm/) · [Editor](evidence/flows/crm-editor-open-editor.png) |
| Metas e Configurações | `?view=settings` | Leitura/edição conforme perfil, conteúdos, importação desabilitada, compartilhamento, aparência | [Capturas](evidence/settings/) |
| Login | `/login`, sem sessão | Duas colunas, formulário móvel, botão Google; sem completar OAuth real | [Capturas](evidence/login/) |
| Acesso pendente | `/acesso-pendente` | Mensagem, marca, saída; redirecionamento por vínculo simulado ausente | [Capturas](evidence/pending/) |

Resoluções: **1920×1080, 1440×900, 1024×768, 768×1024, 390×844 e 360×800**.

Coberturas adicionais:

- **Apresentação:** todos os slides percorridos nos seis tamanhos e dois temas; 328 estados de slide medidos, com 164 capturas representativas. Em 1920 px todos os slides são capturados; nos demais tamanhos a captura cobre cada composição e cada frente comercial, enquanto repetições de páginas de criativos e de etapas do funil são medidas. Capturas suplementares mostram mapa e funis ilustrativos populados. [Apresentação](evidence/presentation/) · [Complementos](evidence/presentation-extra/) · [Medições](evidence/presentation-zoom.json).
- **Zoom:** 100% na matriz principal. 125% e 150% por equivalência de layout de um viewport físico de 1440×900: 1152×720/DPR 1,25 e 960×600/DPR 1,5. Isso reproduz a redução de área útil e a densidade de pixels, **não comprova o zoom nativo pelo menu do navegador nem zoom de toque**. Há capturas dos onze modos de dashboard, login e acesso pendente em ambos os temas. [Capturas](evidence/zoom/).
- **Estados:** carregamento, erro controlado, vazio e parcial nas seis composições principais, em 390×844; consulta de status com erro, fila, cooldown e conclusão indeterminada em 360×800. CRM e Settings mantêm suas composições próprias quando aplicável. [Estados e fluxos](evidence/flows/).
- **Permissões:** viewer/editor/admin em 1440×900 e compartilhamento somente leitura. São perfis de fixture, não uma verificação de RLS. A gravação do formulário é interceptada e confirmada apenas no transporte de teste.
- **Sobreposições:** período, menu móvel, atualização de fontes, lightbox, editor inline e erro de callback. Período e fontes possuem rolagem interna; um PNG integral mostra o fundo da página, mas não todo o conteúdo rolável do diálogo ao mesmo tempo.

**Pacote visual final:** 521 PNGs (capturas e recortes) e 65 pranchas de contato, além dos registros de teste. [Abrir catálogo de imagens](evidence/index.html). As pranchas em `evidence/sheets/` permitem triagem de todas as imagens; os PNGs e recortes em `focus/` e `probes/` preservam a evidência necessária para leitura. A inspeção visual das pranchas foi complementada com abertura dos originais/recortes nos pontos críticos; ela não é uma certificação de acessibilidade completa.

## 3. Achados priorizados

P0 = indisponibilidade ampla ou perda crítica. P1 = comprometimento relevante de leitura ou navegação. P2 = prejuízo localizado de uso/legibilidade. P3 = consistência, eficiência visual e manutenção. A severidade abaixo refere-se à UI local observada.

### F01 · P1 — Cabeçalho perde sua área de título e comprime controles

**Fato:** em 1024×768 o contêiner do título chega a **0 px** de largura; o texto pequeno ainda é pintado sobre a região de sincronização. A faixa de ações alcança x=1185 px: apresentação começa em x=1097 px e menu do usuário em x=1145 px, fora do viewport de 1024 px. O clique de apresentação não consegue alcançar o botão; compartilhar e parte da exportação também ficam fora. Em 768×1024 o botão de navegação encolhe de 40 para **20 px**. Em 1440 px o título já fica truncado. [Recorte 1024](evidence/focus/header-1024.png) · [Medições de elementos fora da tela](evidence/measurements.json) · [Foco e geometria](evidence/probes.json).

**Causa provável:** `Shell.tsx` reúne título e ações fixas em flex; `styles.css:144–165` permite redução dos itens e só retira a sidebar em 980 px. O breakpoint olha a janela, mas a área disponível com a sidebar é menor. `data-sync.css` acrescenta mais ações.

**Proposta:** definir regiões explícitas para título, período e ações; manter largura mínima dos ícones; reorganizar ou levar ações secundárias a menu quando o espaço real não comportar a linha. **Impacto:** todas as telas e compartilhamento; risco médio. **Teste:** todos os rótulos e alvos visíveis, sem interseção de texto/controle em 768/1024 e nos zooms; não basta `scrollWidth`.

### F02 · P1 — Diálogo de período não recebe nem contém o foco

**Fato:** abrir o período pelo teclado e pressionar Tab leva a “Alternar tema”, “Exportar PDF” e outros elementos do fundo. O diálogo declara `aria-modal=true`. Falha reproduzida no teste funcional e no rastreamento dos elementos focados em 1024, 768 e 360 px. [Rastreamento](evidence/probes.json) · [Captura com foco](evidence/probes/keyboard-period-1024.png).

**Causa:** `components/ui/popover.tsx` posiciona o portal e escuta Escape, mas não move o foco para o painel, não fecha um ciclo de Tab/Shift+Tab e não torna o fundo inerte. Não confundir com a lightbox, que passou no teste de retorno de foco.

**Proposta:** concentrar o comportamento de foco no Popover existente: foco inicial previsível, ciclo de teclado, restauração ao gatilho e bloqueio de interação do fundo enquanto modal. **Impacto:** período, menu do usuário e painel de fontes; risco médio. **Teste:** Tab/Shift+Tab, Escape, clique fora e restauração de foco em desktop/mobile; impedir ativação de ações do fundo.

### F03 · P1 — Marcador “hoje” se sobrepõe aos valores das metas

**Fato:** “hoje” atravessa `438 de 420`, `14 de 20`, `17 de 20` e parte da meta monetária. O problema aparece em ambos os temas, também fora de celulares. [Escuro](evidence/focus/pacing-dark.png) · [Claro](evidence/focus/pacing-light.png).

**Causa:** o pseudo-elemento `.pacing-mark::after` em `styles.css:332–333` é posicionado 16 px acima da barra, invadindo a linha de valores do componente `Pacing` (`ui/primitives.tsx:158`).

**Proposta:** dar ao marcador uma faixa de legenda própria ou colocar o rótulo junto à informação de progresso, sem ocupar a linha de valor/meta. **Impacto:** Executiva, Franquias, Condomínios e apresentação; risco médio. **Teste:** metas pequenas/grandes, cumpridas/excedidas, início/fim do mês, zoom e textos longos.

### F04 · P1 — Apresentação de metas fica excessivamente comprimida no celular

**Fato:** o slide “Ritmo do mês” conserva duas colunas em 360/390 px. Rótulos e expressões como “de R$ 50.000,00” se fragmentam e a colisão do marcador se agrava. Os cartões cabem no viewport, mas a leitura fica prejudicada. [360 px](evidence/presentation/360x800-dark-executive-goals.png) · [390 px](evidence/presentation/390x844-light-executive-goals.png).

**Causa:** `presentation.css:27` fixa duas colunas e três linhas; o breakpoint móvel não redefine essa composição. `presentation-layout.ts` pagina criativos e funis, mas não as metas.

**Proposta:** reduzir a quantidade de metas por slide conforme a largura/altura e usar uma coluna em celulares. Conservar os mesmos dados e identidade. **Impacto:** paginação e controles da apresentação; risco médio. **Teste:** percurso completo, contagem de slides, pausa, setas, Escape, resize e inspeção dos valores em 360/390, 125/150%.

### F05 · P2 — Sparklines disputam espaço com badges dos KPIs

**Fato:** os gráficos pequenos alcançam os badges de comparação, inclusive o “s/ comparação”. A interseção foi medida em 1024, 768 e 360 px; no celular o desenho fica atrás do badge do CPL. [Primeira tela móvel](evidence/focus/mobile-first-screen.png) · [Geometria](evidence/probes.json).

**Causa:** `.kpi-spark` fica absoluta no rodapé; a reserva de espaço existe em `.kpi-foot`, mas o badge vive em `.kpi-value`. Não existe contrato de área entre esses dois blocos.

**Proposta:** reservar uma área de grid para o gráfico e outra para número/comparação; em cards estreitos mover o gráfico a uma faixa inferior. **Impacto:** KPIs de todas as páginas; risco médio. **Teste:** valores monetários extensos, badges positivos/negativos/ausentes e seis/quatro/uma coluna. Não alterar os dados ou o cálculo do KPI.

### F06 · P2 — Textos auxiliares e eixos têm pouco contraste, sobretudo no claro

**Fato:** notas, descrições, rótulos e eixos claros são difíceis de ler nas imagens. Comparações dos tokens opacos com fundo branco: `--muted-2 #93a0aa` = **2,68:1**, `#7d8b98` dos eixos = **3,49:1**, dourado `#c88a19` = **2,96:1**. Esses cálculos são de pares de cores, não uma medição de todos os pixels com transparência/gradiente. [Site claro](evidence/site/768x1024-light.png) · [Login claro](evidence/login/390x844-light.png).

**Causa:** tokens de texto secundário muito claros e `useChartColors():89` com a mesma cor de tick nos dois temas; textos de 9–11 px ampliam o problema.

**Proposta:** revisar tokens sem mudar a paleta principal; usar níveis de texto auxiliar com contraste maior e tamanho legível. **Impacto:** aplicação inteira; risco médio de alteração visual. **Teste:** pares de cores reais/composição e revisão de gráficos, notas, estados desabilitados, erros e foco nos dois temas.

### F07 · P2 — Tabelas em tablet comprimem o conteúdo principal e escondem a continuação

**Fato:** em 768/1024 px a tabela de landing pages quebra nomes de página em muitas linhas, enquanto cabeçalhos longos consomem a largura. Algumas colunas exigem rolagem interna, com pouca indicação de continuação. A página não transborda globalmente. [GA4 em tablet](evidence/site/768x1024-dark.png) · [Recorte](evidence/focus/site-tablet-table.png).

**Causa:** tabelas automáticas e cabeçalhos sem quebra consistente; `.desktop-table` só troca para cartões abaixo de 640 px (`styles.css:464, 909–922`). A largura útil também cai pela sidebar.

**Proposta:** definir larguras mínimas por tipo de coluna, permitir quebra controlada nos cabeçalhos e tornar a rolagem perceptível; considerar cartões no ponto em que a tabela deixa de ser legível. **Impacto:** campanhas, detalhamento e três tabelas GA4; risco médio. **Teste:** textos/URLs longos, ordenação, expansão, preservação de todas as colunas e operação por teclado. Rolagem interna intencional não deve ser confundida com defeito de overflow da página.

### F08 · P2 — Orgânico contradiz a origem informada no próprio aviso

**Fato:** o subtítulo diz que os números vêm da conta oficial via Graph API; o aviso seguinte informa que a integração não existe e que os dados são de demonstração. O aviso é visível, mas a afirmação anterior cria uma leitura contraditória. [Orgânico](evidence/organic/390x844-dark.png).

**Causa:** copy fixa em `Organic.tsx:53–54`, sem acompanhar `organicOrigin`; `api.ts:getOrganic` devolve exemplos preexistentes.

**Proposta:** alinhar título/subtítulo à origem já disponível e reforçar “integração pendente / exemplo” junto à hierarquia principal. Não criar métricas nem iniciar integração. A decisão de esconder exemplos existentes requer aprovação de produto. **Impacto:** Orgânico; risco baixo. **Teste:** origem de exemplo versus conectada, capturas e texto literal.

### F09 · P2 — Alternância de tema desaparece da navegação móvel

**Fato:** em 360/390 px o toggle de tema some do cabeçalho. Em telas normais ele pode ser encontrado em Metas e ajustes; em `share=1` essa área é oculta. [Cabeçalho móvel](evidence/probes/header-360.png) · `src/styles.css`, linha 888.

**Causa:** o seletor móvel usa os títulos “Modo claro/escuro” para aplicar `display:none` ao botão.

**Proposta:** disponibilizar aparência em um menu global acessível no celular, inclusive no modo somente leitura. **Impacto:** Shell e compartilhamento; risco baixo. **Teste:** tema por teclado/toque, persistência e acesso com `share=1`, sem habilitar edição.

### F10 · P3 — Frentes indisponíveis repetem muitos painéis vazios

**Fato:** Empresas, Academias e Hospitais apresentam corretamente “—” e integração pendente, mas repetem vários blocos altos com a mesma ausência de dados, gerando páginas longas no celular. [Empresas](evidence/company/360x800-dark.png) · [Academias](evidence/gym/390x844-light.png).

**Causa provável:** `FrontView` preserva o esqueleto completo de uma frente conectada, com alturas mínimas de gráfico e placeholders.

**Proposta:** após aprovação, adotar um resumo compacto de indisponibilidade e seções recolhíveis, mantendo o acesso à comparação e todos os avisos. **Impacto:** três frentes e estado vazio; risco baixo/médio de mudança de hierarquia. **Teste:** continuar sem valores fictícios, manter filtros e acesso às seções. É melhoria de eficiência visual, não bloqueio funcional.

### F11 · P3 — Distribuição vertical deixa vazios amplos em Settings e CRM

**Fato:** no desktop, o painel de metas e alguns painéis comerciais ficam mais altos que o conteúdo necessário; no celular as mesmas composições crescem em longas sequências. Não foi constatado um defeito generalizado de alturas diferentes entre KPIs irmãos. [Settings desktop](evidence/settings/1920x1080-dark.png) · [CRM](evidence/crm/1440x900-light.png).

**Causa provável:** `.panel-stack > .panel { flex:1 1 auto }` (`styles.css:199`) estica todos os painéis da pilha, combinada à grade com altura da coluna vizinha.

**Proposta:** usar altura intrínseca por padrão e esticar apenas pares que precisam alinhar o fechamento; separar leitura vazia de editor preenchido. **Impacto:** Settings, CRM, Executiva; risco médio por compartilhamento de estilo. **Teste:** vazio/preenchido/editor, conteúdo curto/longo, seis tamanhos. Evitar compensar com margens negativas.

### F12 · P2 — Falha de mídia impede acesso ao conteúdo de Configurações

**Fato:** quando a consulta de campanhas falha, Settings e Orgânico podem apresentar a tela genérica de erro do dashboard em vez de seu conteúdo próprio. Site e CRM seguem caminhos separados. A captura mostra esse estado; não comprova indisponibilidade real do serviço. [Settings com falha controlada](evidence/flows/error-settings.png) · [Orgânico com falha](evidence/flows/error-organic.png).

**Causa:** `Dashboard.tsx:66–75` aplica `data.isError/isLoading` antes de renderizar Settings/Orgânico; `useDashboard` agrega a consulta de mídia.

**Proposta:** tornar estados de erro/carregamento proporcionais às dependências de cada view, mantendo verificações de acesso e mensagens de erro das próprias configurações. Não mudar permissões ou regras de persistência. **Impacto:** composição de Dashboard e estados; risco médio/alto, merece etapa própria. **Teste:** falha independente por fonte, recuperação, cache de período, ausência de números antigos e manutenção das restrições de perfil.

### F13 · P2 — Login perde a marca em telas de até 900 px

**Fato:** no login móvel/tablet só aparecem “Portal de resultados” e “Bem-vindo”; a marca Maria Gasolina desaparece. A tela de acesso pendente conserva o logo. [Login móvel](evidence/login/390x844-light.png) · [Pendente](evidence/pending/390x844-light.png).

**Causa:** `.auth-brand-panel` é oculto em até 900 px, enquanto `.login-logo` permanece `display:none` globalmente (`styles.css:792, 873–875`).

**Proposta:** exibir o logo já existente do card quando o painel lateral estiver oculto, ajustando a hierarquia sem alterar o fluxo OAuth. **Impacto:** Login; risco baixo. **Teste:** marca visível em 360/390/768 e zoom, centralização, erro de callback e navegação por teclado.

### F14 · P3 — CSS e componentes legados tornam correções globais arriscadas

**Fato de código:** há regras móveis distribuídas em `styles.css`, `presentation.css` e `components/data-sync.css`, com pontos em 640/699/720/900/980/1099/1240 px. `.hero-stats` recebe grades diferentes no mesmo bloco móvel. Há componentes antigos (`DashboardShell`, `KpiCard`, `DashboardCharts`) coexistindo com Shell e primitives; sua existência sozinha não prova conflito em runtime.

**Causa provável:** evolução incremental com regras acrescentadas ao final dos arquivos e contratos de composição pouco explícitos. Alguns `!important` são justificados por acessibilidade/folha móvel; não devem ser removidos indiscriminadamente.

**Proposta:** documentar os pontos de adaptação e responsabilidades de Shell, KPI, painéis, tabelas e apresentação; consolidar apenas as regras afetadas por correções aprovadas. Verificar usos antes de remover componentes legados. **Impacto:** amplo; risco médio/alto. **Teste:** matriz visual antes/depois, busca de seletores/consumidores e regressão por componente. Não recomenda reescrita, novo framework ou redesign.

## 4. Causas estruturais e escolhas propostas

A aplicação já usa React, CSS próprio, Recharts e Playwright. **Recomendo conservar essa base**: os problemas observados decorrem principalmente de distribuição de espaço, regras compartilhadas e foco. Trocar biblioteca ou framework ampliaria o risco e o custo sem resolver automaticamente essas causas.

Para o layout, grades e regiões explícitas permitem reservar espaço conforme o conteúdo. O trade-off é revisar cada composição que compartilha os estilos; por isso a proposta está dividida em etapas. Patches com margens arbitrárias, offsets absolutos para texto ou `!important` adicionais tornariam o comportamento mais dependente da resolução e foram descartados como estratégia principal.

Para acessibilidade, ajustar o Popover existente reduz a superfície da mudança. Uma biblioteca de diálogos pronta é uma alternativa possível, mas adiciona dependência e pode alterar portais, empilhamento e estilos; não há evidência nesta auditoria de que seja necessária. A decisão seria reapresentada caso o componente atual não comporte uma correção robusta.

Não há proposta de mudar dados, coletores, sincronização, permissões, ranking ou obtenção de previews. As correções compartilhadas de KPI/Shell precisam somente demonstrar que não afetam esses fluxos.

## 5. Auditoria funcional e evidência de teste

- **44 cenários do roteiro local:** 43 concluídos e uma falha intencionalmente preservada como achado — foco no diálogo de período (F02). [Resultado e transporte simulado](evidence/flows.json).
- Passaram: navegação por todas as abas, período personalizado/comparação, plataformas, comparação A/B e preservação de indisponibilidade, GA4 e expansão de tabelas, Top 3/Top 9, lightbox/Escape/retorno de foco, menu móvel/Escape, editor por perfil e compartilhamento.
- Sincronização: clique local simulado, proteção contra clique duplicado, andamento, conclusão parcial, preservação de dados e “Ver Hoje · parcial”; estados de fila, cooldown, indeterminação e erro. Todas as requisições foram interceptadas antes de qualquer rede de produção.
- As seis views de cada estado vazio/erro/carregamento/parcial foram capturadas. Os complementos em `states-confirmed.json` aguardam o estado terminal de erro; usam falha sintética HTTP 400 para não confundir as retentativas automáticas de um HTTP 503 com esse estado terminal. “Cenário concluído” significa que a tela foi exercitada e registrada; não é uma aprovação de qualidade. Por exemplo, o erro de mídia em Settings é justamente o achado F12.
- **15 testes Playwright preexistentes selecionados**, com um worker: a primeira execução teve 12 aprovações e três falhas de espera/timeout, incluindo uma persistência demo após reload ainda sem o elemento esperado. Os três testes passaram na reexecução seletiva com o ambiente aquecido e limite total de 90 s. Isso sugere sensibilidade de execução, mas não estabelece sua causa. O relatório JSON final cobre a reexecução de três testes, não os quinze de uma única rodada. [Relatório da reexecução](evidence/regression-rerun.json) · [Registro consolidado](evidence/test-summary.json).
- `npm.cmd run typecheck`: passou.
- Na matriz principal: 156 capturas completas, nenhum erro de runtime registrado e nenhum overflow horizontal global medido. Medidas de `scrollWidth` nos KPIs contêm falsos positivos devido aos pseudo-elementos decorativos fora do card; não foram promovidas a defeitos sem inspeção.
- Na apresentação: os registros de encaixe são uma verificação geométrica limitada; não detectam colisão interna de rótulos como F03/F04. A saída por Escape também foi rechecada com espera pela atualização da interface, em vez de uma contagem síncrona logo após a tecla. [Checagem suplementar](evidence/presentation-check.json).

## 6. Plano proposto para aprovação

| Etapa | Escopo | Motivo da ordem | Risco/impacto | Critério para encerrar |
|---|---|---|---|---|
| A — leitura e navegação | F01, F02, F03, F04, F05 | Resolve os bloqueios de leitura e teclado compartilhados | Médio; Shell, Popover, KPI/Pacing e apresentação | Matriz dos seis tamanhos/dois temas, teclado e slides sem colisões; Top 3/9 e sincronização simulada preservados |
| B — legibilidade e estados | F06, F07, F08, F09, F12, F13 | Corrige contraste, uso em tablet/móvel e dependências de erro | Médio; F12 isolado por afetar composição funcional | Cores e tabelas legíveis, marca/tema acessíveis, erro de fonte restrito às áreas dependentes; perfis preservados |
| C — consistência e manutenção | F10, F11, F14 | Reduz repetição e dívida de CSS depois de estabilizar os componentes | Médio; decisões de hierarquia precisam aprovação | Comparativos antes/depois e ausência de regressão em estados vazios/preenchidos/editor |

Após aprovação: implementar **nessa mesma branch**, manter a identidade visual e os contratos de dados, produzir comparativos visuais com o mesmo transporte sintético, executar testes relevantes e abrir **PR Draft separado**, sem merge/deploy.

### Prevenção de regressões

1. Testes de geometria devem incluir conteúdo textual e interseção entre valor/badge/gráfico, além de overflow global. Pseudo-elementos decorativos precisam ser excluídos de falsos alarmes.
2. Testar o contrato de foco de cada Popover: abertura, primeiro foco, ciclo Tab/Shift+Tab, Escape e restauração. Verificar as permissões do fundo sem enviar ação real.
3. Matriz visual com dados vazios, textos longos, números grandes, metas excedidas, erro parcial e três perfis; fotos/imagens sintéticas claramente identificadas.
4. Percorrer todos os slides por tamanho; aguardar imagens/fontes e atualização de estado antes da captura. Conferir números e rótulos internamente, não apenas os limites dos cards.
5. Manter testes de Top 3/9, ranking, modal, filtro de plataforma, período, compartilhamento e sincronização simulada. Nenhuma correção nesta frente deve alterar previews do PR #10.
6. Só atualizar referências visuais após revisão humana dos PNGs. Testes automáticos verdes não encerram a revisão visual.

## 7. Reprodução e arquivos

Arquivos autorais estão apenas em `audit/`: roteiro e fixture de transporte, captura, fluxos, apresentação/zoom, probes, configuração Playwright, gerador de catálogo e este diagnóstico. `audit/evidence/` é saída local ignorada pelo Git.

Com dependências do lockfile instaladas (`npm.cmd ci --ignore-scripts`), iniciar em PowerShell:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:55498'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_AUDIT_SYNTHETIC_ONLY'
node node_modules/vite/bin/vite.js --configLoader runner --host 127.0.0.1 --port 5196 --strictPort
```

Em outro terminal dessa worktree: `node audit/capture.mjs`, `node audit/flows.mjs`, `node audit/presentation-zoom.mjs`, `node audit/probes.mjs`, `node audit/presentation-check.mjs`, `node audit/final-checks.mjs` e `node audit/states-confirm.mjs`. O transporte bloqueia qualquer origem diferente do servidor local e da API sintética interceptada. O servidor não deve receber `.env` de produção. Não executar scripts de sync/homologação do repositório para reproduzir esta auditoria.

O catálogo HTML funciona com caminhos relativos ao extrair o pacote. `manifest.json` registra hashes das evidências. A validação de integridade do ZIP não substitui a inspeção visual descrita acima.

## 8. Execução incremental aprovada

A autorização posterior ao diagnóstico permite implementação, PR e publicação serial das correções descritas, após os critérios de teste e revisão visual. Ela substitui a restrição inicial de merge/deploy para esse escopo. Backend, dados, permissões, integrações e previews Meta continuam fora do escopo.

Estados: **pendente → em execução → corrigido → publicado → validado**. “Corrigido” exige verificação local; a leitura autenticada de produção é registrada separadamente quando indisponível.

| Achado | Prioridade | Estado | Entrega |
|---|---|---|---|
| F01 · Cabeçalho | P1 | publicado | [01 · PR #11](releases/01/README.md) · validado localmente; autenticado pendente |
| F02 · Foco do período | P1 | publicado | [01 · PR #11](releases/01/README.md) · validado localmente; autenticado pendente |
| F03 · Marcador hoje | P1 | publicado | [02 · PR #12](releases/02/README.md) · validado localmente; autenticado pendente |
| F04 · Metas na apresentação móvel | P1 | publicado | [02 · PR #12](releases/02/README.md) · validado localmente; autenticado pendente |
| F05 · Sparklines dos KPIs | P2 | publicado | [04 · PR #14](releases/04/README.md) · validado localmente; autenticado pendente |
| F06 · Contraste | P2 | publicado | [04 · PR #14](releases/04/README.md) · validado localmente; autenticado pendente |
| F07 · Tabelas em tablet | P2 | publicado | [05 · PR #15](releases/05/README.md) · validado localmente; autenticado pendente |
| F08 · Origem no Orgânico | P2 | publicado | [06 · PR #16](releases/06/README.md) · validado localmente; autenticado pendente |
| F09 · Tema no celular | P2 | publicado | 01 · PR #11 · validado localmente; autenticado pendente |
| F10 · Painéis indisponíveis | P3 | corrigido | [07 · Composição de painéis](releases/07/README.md) · publicação pendente |
| F11 · Distribuição vertical | P3 | corrigido | [07 · Composição de painéis](releases/07/README.md) · publicação pendente |
| F12 · Erro de mídia em Settings | P2 | publicado | [03 · PR #13](releases/03/README.md) · validado localmente; autenticado pendente |
| F13 · Marca no login móvel | P2 | validado | [06 · PR #16](releases/06/README.md) · login público confirmado; OAuth real não exercitado |
| F14 · Responsabilidades do CSS | P3 | corrigido | [07 · Contratos e consolidação](releases/07/README.md) · publicação pendente |

Os scripts e as 521 capturas do diagnóstico pertencem ao pacote local original; não são incluídos integralmente no Git. Os testes de regressão das entregas ficam em `src/` e `e2e/`, com evidências selecionadas em `audit/releases/` e saídas integrais locais em `artifacts/`.
