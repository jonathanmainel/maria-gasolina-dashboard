# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable visual direction (redesign de 14/09/2026 — GT+)

- Público: time de marketing da Maria Gasolina (Carolina), gerente de expansão (André) e fundadores (Rodrigo Benetti e Antônio Barbosa). O dashboard é a prova visível de entrega da GT+; nunca voltar ao layout genérico de relatório.
- Navegação por **frente**, não por canal: Visão executiva → Franquias → Condomínios → Orgânico → CRM e vendas → Metas e ajustes (`src/views/*`). Google Ads e Meta Ads são detalhes dentro de cada frente.
- Tema **dark premium por padrão** com toggle claro (`src/theme.tsx`, tokens em `src/styles.css`). Marca como camada contida: Montserrat, vermelho `#9d2a1e`, dourado `#d7982b`, navy `#324552`, logo oficial. Sem texturas vintage, sem fotografia, sem Bebas Neue.
- Cena 3D real (Three.js via react-three-fiber) no herói da visão executiva e da apresentação: mapa do Brasil em matriz de pontos com unidades, sede e praças em negociação (`src/components/three/BrazilMap.tsx`, geometria em `src/data/brazil-geo.json`). Carregar sempre com `lazy` para não pesar o bundle inicial.
- Micro-animações em tudo que é número: contadores (`AnimatedNumber`), barras de ritmo, anéis, funil e gráficos que se constroem no tempo (esse é o "4D"). Respeitar `prefers-reduced-motion`.
- Métrica-rei por frente: **leads e CPL**. Não classificar qualificado vs não qualificado enquanto o CRM não tiver UTM confiável.
- Metas são **editáveis na tela** (`src/lib/goals.ts`, view Settings) e alimentam pacing, anéis e projeções. Nunca fixar meta em código.
- Orgânico (Instagram + Facebook via Meta Graph API): seguidores, novos seguidores, crescimento, engajamento, curtidas, comentários, DMs, top 3 posts. Enquanto a API não estiver ligada, usar `src/data/demo.ts`.
- CRM Elo: a área existe com dados **ilustrativos e sinalizados** (banner) até a API do Elo ser liberada. Não remover a área nem esconder o aviso.
- Sem camada de IA/insights automáticos (decisão do cliente).
- Modo apresentação (`?present=1`) para TV com rotação automática, link somente leitura (`?share=1`), exportação PDF via `@media print` e mobile tratado como prioridade (grades colapsam para 1 coluna abaixo de 640px).
- Manter resultados de plataforma separados do `form_submit` do GA4 quando o GA4 voltar a ser exibido (modelos de atribuição diferentes).
