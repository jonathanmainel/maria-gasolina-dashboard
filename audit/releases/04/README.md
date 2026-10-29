# Entrega 04 · KPIs e legibilidade

Estado: **publicado; validação local e leitura pública confirmadas; homologação autenticada pendente**. Base publicada: `743ca6fc561bdfe4a8b6d846f4ca11410c7598be` (PR #13).

## F05/P2 · Espaço próprio para número, comparação e gráfico

A sparkline passa a ocupar o rodapé do KPI no fluxo normal, com quebra conforme o espaço disponível. Deixa de ser uma camada absoluta que podia atravessar o badge. Notas do período anterior podem ocupar mais de uma linha; números principais extensos usam o ajuste ao contêiner já empregado na apresentação. Valores/cálculos e formatação monetária são preservados.

A inspeção antes/depois também confirmou uma colisão preexistente da minissérie dos resumos de frente da Executiva com o texto de candidatos. Esses gráficos passam ao fluxo normal, e suas células seguem a mesma adaptação por contêiner. A regressão mede as duas composições.

O teste de estresse revelou outro limite da mesma composição de indicadores: valores monetários grandes alargavam as colunas de Meta/Google e empurravam o CTR para fora do celular em 36 px. O resumo agora adapta a grade à largura **do card**, com investimento numa linha própria quando estreito e uma coluna em cards ainda menores. São consultas de contêiner, compatíveis com a base CSS que já usa unidades de contêiner; não há recorte para esconder o problema. O custo é mais altura quando o conteúdo precisa de espaço.

## F06/P2 · Texto e cor gráfica têm funções distintas

Texto auxiliar e eixos passam a tons legíveis nos dois temas. O dourado de texto e as cores de texto de status/canais têm tokens próprios; preenchimentos, marca e acentos gráficos conservam sua paleta. O dourado dos gráficos no claro recebe um tom um pouco mais escuro, e os ticks usam o token CSS existente em vez de um hexadecimal igual nos dois temas.

O alvo dos pares de texto medidos é **4,5:1**, conforme [WCAG 2.2 / SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). A medição cobre os tokens contra superfícies sólidas e os ticks efetivamente renderizados; **não é uma certificação de contraste de todos os pixels/gradientes ou de acessibilidade integral**. A inspeção visual continua obrigatória. Marca e painéis não foram redesenhados.

## Verificações

- **39/39 testes relevantes** de KPI/sparkline, Executiva, frentes, Orgânico, criativos e métricas.
- Typecheck/build aprovados.
- Primeira passagem corrigiu o leitor de cores do teste para `#fff` e o seletor dos ticks da versão instalada do Recharts; o overflow de CTR encontrado no estresse foi corrigido na aplicação. Registros iniciais/probes foram preservados.
- Após o ajuste: **6/6 cenários críticos** aprovados, incluindo onze views móveis, dinheiro extenso, comparação positiva/negativa e medição dos eixos.
- Primeira matriz ampla: **52/54 aprovados**; os dois cortes de investimento em 1920 px, nos dois temas, levaram ao mínimo intrínseco da coluna monetária. A revisão visual também estendeu o fluxo normal aos resumos de frente. Esses registros foram preservados.
- Matriz após a correção final: **32/32 aprovados**. Onze views em seis resoluções/dois temas mais áreas equivalentes a zoom 125/150%; dinheiro extenso nos seis tamanhos; composições da apresentação, login e acesso pendente em desktop/mobile. Zoom por área disponível, não zoom nativo do navegador.
- Os **22 cenários de navegação** da rodada ampla passaram: cabeçalho, Tab/Shift+Tab, Escape/retorno, apresentação, filtros, Top 3/9 e lightbox. São resultados consolidados de duas rodadas, não 54 testes numa única rodada final.
- **12/12 cenários suplementares de gráficos aprovados**, nos seis tamanhos e dois temas. A espera verifica barras com altura positiva e formas SVG estáveis, para evitar registrar somente os eixos durante a animação. Nenhum código da aplicação foi alterado nessa checagem.

Reprodução: build sintético da [entrega 02](../02/README.md) e `npx playwright test --config playwright.uiux-legibility.config.ts`. As séries de histórico e escala monetária pertencem somente à fixture de estresse em memória. Nenhuma coleta/gravação de produção. Saídas: `artifacts/uiux-04/`. [Resumo verificável dos resultados](validation-summary.json).

## Compatibilidade

`FrontView.tsx` só altera o resumo `ChannelCard` e seus tons de texto; a implementação `CreativeCard` no mesmo arquivo permanece intacta. A cor de texto do aviso de resolução e dos chips recebe a regra geral de contraste, sem alterar preview, seleção, ranking, frames, armazenamento ou atualização seletiva. Registrar essa diferença de CSS ao reconciliar com o PR #10.

[Catálogo antes/depois](index.html) · [KPIs e resumos em 360 px](comparison-kpis-360.png) · [Login claro](comparison-login-360-light.png).

O login do diagnóstico foi capturado no servidor de desenvolvimento, que exibe o link “Abrir demonstração local”; o build de validação, assim como a publicação, omite esse link por uma condição preexistente. Essa diferença não pertence à correção de contraste nem altera autenticação. O problema de marca ausente no móvel permanece em F13.

Homologação autenticada de produção permanece pendente sem sessão autorizada no contexto de leitura.

## Publicação concluída em 28/10/2026

- [PR #14](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/14), correção `7a7ea6036b51c6e64d969aa7ba7ea51e144bb289`, merge `5970651b08756d49608af19e3bb5f7644c1431f0`.
- [Actions/Pages](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40750640374): **55 arquivos / 624 testes aprovados**, typecheck, build e deploy concluídos.
- [Site publicado](https://jonathanmainel.github.io/maria-gasolina-dashboard/): HTTP 200; CSS novo confirmado. Login real inspecionado em 1440×900 e 390×844 nos dois temas, sem erro de execução/configuração, overflow ou requisição de gravação. [Registro](production-verification.json).
- [Antes/depois do login público em 390 px](production-comparison-390-light.png), ambos em navegador novo e sem sessão; mostra o ganho de contraste em produção. Os KPIs internos continuam com homologação autenticada **pendente**; nenhuma fixture foi usada na leitura pública.
- Arquivos de produto: `src/styles.css`, `src/presentation.css`, `src/components/ui/primitives.tsx`, `src/lib/use-dashboard.ts` (somente cores), `src/views/FrontView.tsx` (somente ChannelCard). Demais arquivos são testes, documentação e evidências.
- Restam **seis achados**: F07/F08/F13 (P2) e F10/F11/F14 (P3). Próxima entrega: F07, sobre a main atualizada após esta publicação.
