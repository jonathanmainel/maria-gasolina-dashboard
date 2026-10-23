# Revisão visual para apresentações — 23/10/2026

## Escopo da publicação

Frontend baseado em `origin/main` `885316af776ac1026a0a822568911ae2d61fcd66`, em worktree independente e branch `codex/revisao-visual-apresentacao`. Nenhum arquivo de outras sessões foi incorporado ou sobrescrito.

- Cards de criativos com área uniforme, imagem inteira e proporção preservada. Resolução lida da imagem efetivamente decodificada, aviso de origem limitada e ampliação máxima de 2× para fontes menores que 600 px no lado curto. Essa ampliação de exibição não gera um arquivo novo nem recupera detalhes ausentes.
- Modal ocupa a área disponível, preserva proporção, foco, Escape, fechamento e limites da viewport. Escape da imagem não encerra a apresentação. URLs privadas podem ser renovadas uma vez após falha; a indisponibilidade da imagem preserva as métricas.
- Previews dinâmicos reconhecem metadados de vídeo quando disponíveis. Leitura de metadados e URLs assinadas continuam isoladas por cliente e usuário.
- Funis ilustrativos explícitos em Vendas e na apresentação, desativados inicialmente. Franquias: 10 etapas, snapshot 24/68/31/22/14/11/7/4/3/18, 9 contratos e R$ 760.500,00. Condomínios: 8 etapas, 15/42/18/14/11/6/2/9, 6 contratos e R$ 108.000,00. São exemplos independentes, identificados e mantidos apenas na memória da interface. Nenhuma escrita operacional, alteração de CRM ou mistura com a Visão Executiva.
- Atualização compacta aguarda o recarregamento das consultas, invalida caches de mídia/site/orgânico/previews e informa o horário da consulta em Brasília. A data de sincronização e a cobertura das fontes permanecem independentes, incluindo a defasagem do Google Ads. Erros são indicados discretamente; nenhuma coleta é disparada.
- Apresentação paginada conforme a viewport: resultados, ritmo do mês, criativos e funis em slides próprios; até três criativos e até cinco etapas por slide (três em viewports baixas). Posts orgânicos têm slide próprio. Valores financeiros permanecem completos, em uma linha, com fonte ajustada ao espaço.

## Diagnóstico e limite das imagens

A auditoria anterior identificou fontes Meta de aproximadamente 64×64 px. O dimensionamento de card/modal também contribuía para cortes ou exibição no tamanho intrínseco. Esta publicação corrige a apresentação e informa a limitação; **não altera a resolução dos arquivos já armazenados**.

A função `sync-meta-ads` publicada ainda usa a estratégia de previews v2. Melhor seleção de candidatos por dimensões reais, proteção contra substituição inferior, caminhos versionados e atualização seletiva dos previews pertencem à entrega de backend ainda não homologada. Não estão sendo promovidos neste PR. Nenhum arquivo antigo ou URL assinada é excluído pelo frontend.

Acesso ao arquivo original do vídeo não foi confirmado com as permissões disponíveis. O token de ingestão não está disponível localmente; o conector consultado não oferece o download de `source`. FFmpeg seria adequado a uma execução operacional pontual, sem infraestrutura recorrente e fora do navegador, **após confirmar acesso autorizado ao asset**. Não há extração de frames ou processamento de vídeo nesta versão.

## Dependências e segurança

Não requer migrations, SQL, alteração de RLS, secrets, novos serviços, mudanças no bucket ou deploy de Edge Functions. Não modifica ingestão, métricas, atribuição, autenticação ou workflow. O Storage continua privado. A autorização de publicação limita-se ao frontend validado.

## Evidências reproduzíveis

- `npm run typecheck`
- `npm test -- --maxWorkers=1` — suíte completa, sem exclusões.
- `npm run build:pages` — build operacional, sem ativar demonstração global.
- `npx playwright test --config playwright.release.config.ts --workers=1` — galeria e verificações de todos os slides em 1366×768, 1440×900, 1920×1080, 2560×1440, 3840×2160 e 3440×1440, além de 1092×614 e 1536×864 (viewports efetivas equivalentes à redução por zoom 125%; não é uma medição do zoom nativo do navegador).
- `npx playwright test --config playwright.hotfix.config.ts` — respostas sintéticas isoladas do Supabase para verificar recarregamento efetivo, datas independentes e preview de 64×114 px em desktop/mobile.
- Testes de componentes verificam resolução, falha, URL assinada/cache/renovação, preservação das métricas, origem comercial e ranking.

As capturas locais usam artes sintéticas identificadas, de 1080×1920, 1920×1080 e 64×64 px. Não comprovam melhoria de arquivos reais do Meta. A galeria em `artifacts/release-gallery/` e a comparação com a base original em `artifacts/before-gallery/` são artefatos locais, fora do bundle de produção.

## Recuperação

Registrar novamente o SHA de `main` imediatamente antes do merge. Em regressão crítica, reverter o commit do merge por um novo commit e acompanhar o novo deploy. Não reescrever o histórico nem usar force push. Validar produção após a conclusão do workflow; distinguir teste com respostas controladas de uma sessão real autenticada.

## Resultado local da homologação

- TypeScript e build de produção aprovados. Aviso existente de chunks acima de 500 kB, sem erro de compilação.
- Suíte completa: 472 testes aprovados. Após acrescentar o reconhecimento de `video_id` em dinâmicos, os 6 testes do módulo de previews também passaram.
- 19 E2E aprovados: 10 da apresentação, 4 operacionais com respostas controladas e 5 de regressão de origem/ausência comercial. Nenhum teste foi desativado e o workflow permanece intacto.
- Recarga operacional sintética: investimento passa de R$ 100,00 para R$ 200,00 após nova consulta; cobertura do Google Ads permanece em 27/09/2026 e nenhuma Edge Function é invocada.
- 139 capturas da revisão, incluindo modais desktop/mobile, e 10 da base anterior. Galeria local: `artifacts/galeria-revisao.html`. Imagens de exemplo são sintéticas; o aviso de 64×64 px demonstra honestamente a limitação da origem.
- Fullscreen, saída, setas, pausa e retorno do foco do modal aprovados. Viewports reduzidas não apresentaram sobreposição de funis ou quebra de KPIs.

A verificação em uma sessão real autenticada de produção deve ser registrada separadamente após o deploy; os testes com respostas controladas não equivalem a esse acesso.
