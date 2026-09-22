# Handoff — Dashboard Maria Gasolina Express

Este pacote é a entrega do redesign do dashboard de mídia da Maria Gasolina
Express (cliente GT+) para o time de desenvolvimento dar continuidade e
ligar os dados reais. Tudo abaixo é o que um dev precisa saber para pegar o
projeto do ponto onde ele está.

## O que já está pronto

- **Interface completa e navegável**, com dados de demonstração
  determinísticos (mesmos números a cada carga), organizada por frente de
  negócio: Visão Executiva, Franquias, Condomínios, Orgânico, CRM/Vendas e
  Metas/Ajustes.
- **Design system em `src/styles.css`**: tema escuro por padrão com toggle
  claro, tokens de cor/tipografia da marca, componentes reutilizáveis
  (`src/components/ui/primitives.tsx`) — cards de KPI animados, funil de
  vendas, anéis de progresso, gráficos.
- **Cena 3D** (Three.js + react-three-fiber) do mapa do Brasil na visão
  executiva/apresentação (`src/components/three/BrazilMap.tsx`) e um fundo
  3D ambiente persistente (`src/components/three/AmbientField.tsx`).
- **Metas editáveis na tela** (`src/lib/goals.ts`), hoje salvas só no
  `localStorage` do navegador — ver pendência abaixo.
- **Modo apresentação** em tela cheia (`?present=1`), **link somente
  leitura** (`?share=1`) e **exportação em PDF** (via impressão do
  navegador, `@media print` em `styles.css`).
- **Autenticação Google via Supabase** já implementada em `src/auth.tsx` e
  `src/lib/supabase.ts` — funciona assim que as credenciais forem
  configuradas (ver `.env.example`).
- Suíte de testes unitários (`npm test`) e um teste E2E de exemplo
  (`e2e/dashboard.spec.ts`, Playwright).

## O que falta para ir ao ar com dados reais

Tudo abaixo está deliberadamente isolado atrás de funções em
`src/lib/api.ts` — a interface já espera esse formato de dados, só falta
trocar a fonte de "demo" por "RPC real do Supabase".

1. **Google Ads / Meta Ads / GA4** — o dashboard original (antes deste
   redesign) já tinha esse pipeline funcionando via RPCs do Supabase
   (`get_dashboard_overview`, `get_dashboard_entities`, `get_dashboard_pmax`,
   `get_dashboard_ga4_*`, ver `src/lib/api.ts`). As novas funções
   `getFrontData` e `getOrganic` (mesmo arquivo) precisam das RPCs
   equivalentes segmentadas por frente (franquia/condomínio) —
   `get_dashboard_fronts` e `get_dashboard_organic` são os nomes já
   referenciados no código, ainda não existem no banco.
2. **Meta Graph API (Instagram/Facebook orgânico)** — hoje 100% mock em
   `src/data/demo.ts` (`demoOrganicDaily`, `demoOrganicPosts`). Precisa de
   um job de sync diário gravando em uma tabela que a RPC
   `get_dashboard_organic` possa ler. Estrutura de dados esperada está em
   `src/types.ts` (`OrganicDaily`, `OrganicPost`).
3. **CRM Elo** — a área inteira de CRM/Vendas (`src/views/Crm.tsx`) está
   marcada na própria interface como "dados ilustrativos" com um aviso
   visível ao usuário. O cliente confirmou que o Elo ainda não expõe API de
   leitura; está em desenvolvimento pelo fornecedor deles. Quando a API
   existir, a função `demoCrm` em `src/data/demo.ts` precisa virar uma
   chamada real (`getCrm` em `src/lib/api.ts` já existe como stub) e o
   aviso de "ilustrativo" deve ser removido de `Crm.tsx`.
4. **Metas em `localStorage`** — hoje cada navegador guarda suas próprias
   metas. Para o time real usar de forma compartilhada, migrar
   `src/lib/goals.ts` para persistir numa tabela do Supabase por cliente
   (o padrão de leitura/escrita já existe, é só trocar o storage).
5. **Entregas do contrato** (`getDelivery` em `src/lib/api.ts`, hoje mock em
   `demoDelivery`/`demoWhatsappFlow`) — depende de onde a GT+ for registrar
   posts/stories/criativos publicados e os dados da automação de WhatsApp.

## Como rodar local

```bash
npm install
cp .env.example .env.local   # preencher com as credenciais do Supabase
npm run dev                  # abre com dados reais (se configurado)
# ou, para ver a interface completa sem backend:
# http://localhost:5173/dashboard/maria-gasolina?demo=1
```

Outros comandos úteis: `npm run typecheck`, `npm test`, `npm run build`.

## Decisões de produto que vieram do cliente (não mudar sem alinhar)

Ver `AGENTS.md` na raiz do projeto — lista as decisões de direção visual e
de produto tomadas com a GT+ (navegação por frente, métrica-rei = leads e
CPL, sem camada de IA/insights automáticos, mobile como prioridade, etc.).
