# Entrega 03 · Estados proporcionais às fontes

Estado: **corrigido e validado localmente; publicação pendente**. Base: `b1103467737289c765c3b190a6cb61e2d96bf34b`, após o PR #12 e confirmação de seu Pages.

## F12/P2

Configurações passa a usar o estado da sua consulta de dados manuais; Orgânico usa o estado da consulta orgânica existente. Falhas/carregamento de campanhas deixam de substituir essas telas por um erro ou skeleton global. As telas continuam ocultando seus próprios valores durante carregamento/erro da sua fonte, com mensagem e repetição específicas.

A mudança expõe estados e a função de releitura já existente no React Query. `manual-inputs.ts` recebe somente `refetch: query.refetch` no retorno do hook. Funções de gravação, autorização, chaves de cache, intervalos de consultas e sincronização permanecem intactos. “Tentar novamente” relê a consulta da tela; não solicita coleta às plataformas.

As mesmas decisões de `canEdit` e `share=1` permanecem em uso; dados comerciais, regras de negócio, backend e previews não mudam. Executiva e frentes mantêm o tratamento de mídia anterior. Orgânico continua com a demonstração e seu aviso existentes; a correção de sua descrição contraditória é F08 e continua pendente.

## Validação

- **46/46 testes relevantes**: estados próprios/independentes, repetição isolada, restrição de compartilhamento, perfis, origem dos dados, navegação e normalização manual.
- Typecheck e build aprovados.
- Primeira passagem Playwright: **7/7**; inclui erro de mídia, carregamento/erro/recuperação de Configurações em desktop/mobile, três perfis e período/filtro orgânico.
- Matriz completa nas seis resoluções e dois temas, mais regressão de navegação: **42/42 aprovados**, sem reexecução por falha. Inclui 24 capturas das duas views sob erro terminal de mídia, loading da mídia, estados próprios e os 22 cenários de navegação já publicados.
- Inspeção visual das composições e abertura nativa dos estados móveis: conteúdo acessível, sem sobreposição/overflow; loading/erro próprios não mostram os campos de metas. Os problemas de contraste, descrição orgânica e distribuição de painéis continuam abertos em F06/F08/F11.

Toda rede de teste usa a fixture local. Nenhuma coleta ou gravação de produção. `state.writes` e origens externas bloqueadas devem permanecer vazios. Recuperação verifica que o número de consultas de mídia não aumenta ao repetir apenas Configurações.

O erro/carregamento **próprio** de Orgânico é exercitado em unidade com estado controlado; a fonte atual não tem ingestão e devolve demonstração local. Não foi inventado um endpoint orgânico para afirmar uma integração E2E inexistente.

Reprodução: o mesmo build com URL/chave sintéticas descrito na entrega 02, seguido de `npx playwright test --config playwright.uiux-sources.config.ts`. Saídas: `artifacts/uiux-03/`.

## Evidências e publicação

![Configurações antes/depois sob erro de mídia, usando fixtures locais](images/settings-comparison.png)

![Orgânico antes/depois sob erro de mídia, usando demonstração preexistente](images/organic-comparison.png)

[Loading próprio em 360×800](images/settings-own-loading.png) · [Erro próprio em 360×800](images/settings-own-error.png). Os pares em 390×844 mostram o viewport inicial do documento; o cabeçalho também incorpora a entrega 01 já publicada. Capturas integrais de cada resolução permanecem em `artifacts/uiux-03/`.

PR, commit, Actions/Pages e leitura pública serão registrados após a integração. A homologação autenticada de produção permanece pendente sem sessão autorizada no contexto de verificação.
