# Previews Meta — piso HD, thumbnails completas e cobertura

28/10/2026. Implementação aprovada pelo responsável nesta conversa, exclusivamente
na branch `codex/meta-creative-preview-quality`. PR #10 permanece draft. Sem merge,
deploy, migration, upload, exclusão ou atualização de previews de produção.
Base do #8 integrado preservada. Este documento atualiza os relatórios anteriores.

## Comportamento implementado

O módulo de enriquecimento consulta `/{video_id}/thumbnails` por GET, segue a
paginação até o fim dentro de seis páginas de 50 itens e valida os próximos links
como HTTPS da Graph API. Ciclo, erro ou limite de paginação ficam explicitamente
pendentes; uma coleção parcial não é apresentada como completa. A coleção é um
endpoint oficial descrito no [SDK Meta AdVideo](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/advideo.py).

Todas as thumbnails distintas são medidas, inclusive `is_preferred=false` e as
que declaram dimensões pequenas. Nem o primeiro arquivo válido nem dimensões
declaradas encerram a busca. Os arquivos passam pela validação existente de
container, assinatura e dimensões codificadas. A auditoria local acrescenta a
decodificação completa por Pillow, e a galeria confirma o decoder do navegador;
o parser leve da Edge Function não foi descrito como um codec JPEG completo.

Prioridade: melhor thumbnail oficial da própria peça em Full HD; na ausência,
melhor HD. Os dois eixos precisam atingir o piso: **1080×1920 / 720×1280** para
vertical próximo de 9:16. Proporção tolerada em 3,5%, preservando o conteúdo;
quadrado, 4:5 e paisagem usam pisos equivalentes e orientação original.
160×284 não é uma atualização aceitável. 1072×1928 é HD, nunca Full HD estrito.
Quando o formato nativo oficial está disponível, candidatas de outro recorte
são rejeitadas mesmo que tenham pixels suficientes.

O limite de oito candidatas foi removido: o limite defensivo é 320 por anúncio.
Acima dele, a tentativa fica pendente, em vez de aprovar uma amostra truncada.
Downloads continuam limitados por tamanho, timeout, hosts e concorrência
existentes. Um cache de no máximo quatro inspeções por execução compartilha o
resultado do mesmo vídeo/URLs dentro da mesma conta; não é persistente, não
guarda todos os bytes baixados e não mistura escolhas visuais diferentes.

Se a coleção não fornecer Full HD, o módulo também compara capas/fallbacks
oficiais da mesma peça. Se nenhuma imagem HD servir, pode receber um
**adapter de frame explicitamente fornecido** pelo
operador local. O endpoint publicado não habilita esse adapter e não inicia
FFmpeg. `scripts/extract-meta-preview-frame.py` é o utilitário local: exige ID na
lista explícita e auditoria prévia de thumbnails, pula o vídeo quando já existe
thumbnail HD, aceita um arquivo autorizado de até 100 MiB e usa FFmpeg fornecido
explicitamente para gerar frames nativos em 0,5/1/1,5/2/3 s. Não usa escala,
rede, credenciais ou banco. Os frames precisam de inspeção visual antes da escolha.
O adapter valida novamente vídeo, arquivo e piso; falha ou ID divergente mantém
o preview anterior. Nenhum serviço, fila ou processamento recorrente foi criado.

## Escolha visual e proteção do atual

Pixels não garantem nitidez ou representatividade. Na amostra, o primeiro item
Full HD de alguns vídeos era uma geladeira ou a pessoa de costas. Isso é mídia
do vídeo correto, mas não é necessariamente a melhor capa. Não foi adicionada
uma inferência semântica por IA ao dashboard.

O seletor permite preservar uma escolha revisada por **video_id + SHA-256** em
`metadata.preview_reviewed_thumbnail={video_id,sha256}`. É dado na coluna JSON
existente, não um novo schema. A escolha precisa pertencer à coleção da própria
peça, bater com os bytes baixados e não reduzir nenhum eixo da melhor candidata.
Escolha de outro vídeo ou de resolução inferior não prevalece. Esse mecanismo
evita perder a capa revisada de “Ganhar dinheiro em 2026” em empates de dimensão.
Na aplicação local aos onze foram usados os hashes da inspeção visual anterior;
**nenhum desses metadados foi escrito no banco real**. Aprovação humana dos
arquivos e de sua aplicação em produção continua separada.

Sem escolha revisada, a seleção por pixels é determinística e registra
`pending_visual_review`. Essa marca não constitui aprovação visual automática.
O lote futuro deve vincular as escolhas revisadas antes de aplicá-las em produção.

O arquivo existente é medido e tem seu SHA conferido antes de uma substituição,
mesmo se já houver dimensões nos metadados. A comparação impede downgrade,
troca de orientação/recorte ou substituição por conteúdo de identidade incerta.
Mesmo hash não gera novo upload. Arquivos atuais superiores ou equivalentes
permanecem. Sem HD, há `pending_no_hd_source`; sem completar a coleção,
`pending_collection_incomplete`; falha ao verificar o atual também fica pendente.
Metadados, arquivo e referências anteriores continuam preservados em falhas.

Uploads permanecem privados, imutáveis e sujeitos ao compare-and-set existente.
Origem, pixels reais, hash, bytes, resultado, data e referência anterior ficam
nos metadados já existentes. Nenhuma URL CDN assinada ou token é persistido ali.
Reservas/guards, autenticação, métricas, ranking, cron, RLS e coletores Google/GA4
não foram modificados nesta rodada. A coleta normal reutiliza o legado;
a publicação futura do código, sozinha, não dispara atualização em massa.

## Apresentação

Cards com imagem vertical usam espaço 9:16. O modal usa uma moldura 9:16 que cabe
na área disponível; apresentação ajusta a mesma moldura à seção sem extrapolar
o slide. A imagem usa `object-fit: contain`, preserva proporção e pode ter faixas.
Não há corte, esticamento, reencodificação ou upscale de arquivo. O limite de
ampliação das imagens pequenas continua. Imagens quadradas/horizontais não são
convertidas em arquivos verticais. Dimensões não aparecem mais no card, conforme
pedido anterior; continuam disponíveis na inspeção ampliada.

## Cobertura confirmada

Categorias abaixo são exclusivas para evitar contar o atual adequado duas vezes.

| Cobertura dos 44 registros | Quantidade | Evidência |
| --- | ---: | --- |
| Melhoria Full HD confirmada localmente | 5 | Thumbnails reais 1080×1920 |
| Melhoria HD confirmada localmente | 5 | Quatro 720×1280 e uma 1072×1928 |
| Preview atual já adequado | 1 | 1080×1920; manter arquivo atual |
| Sem fonte HD após coleção completa | 0 | Nenhum dos onze entrou nessa situação |
| Coleção completa ainda não confirmada | 33 | Auditoria básica realizada, limite de acesso descrito abaixo |

Os onze têm, portanto, seis opções Full HD e cinco HD. O seletor TypeScript
corrigido foi aplicado aos **165 arquivos reais locais**, com a lista completa
de candidatas e dimensões declaradas originais. Comparações não fizeram chamadas
externas ou writes no banco: 11 verificações aprovadas, dez melhorias possíveis
e preservação do atual já Full HD. A escolha por hash reproduziu as capas
visualmente inspecionadas, incluindo “Ganhar dinheiro em 2026” e Daniela.

### Auditoria somente de leitura dos outros 33

Leitura reconfirmada de todos os 44 registros no Supabase. Para os outros 33,
foram consultados 30 criativos distintos, todos retornados com a conta correta,
e resolvidos os video_ids inclusive dos quatro dinâmicos antes sem esse dado
persistido (22,63,64,67). Os quatro continuam sem gravação em produção.

A consulta dos 30 vídeos distintos pelo conector oficial retornou 20, deixando
dez não resolvidos, correspondentes a dez registros. O campo `download_hd_url`
suportado pelo conector veio nulo nos vinte retornados; não é prova de que todas
as versões HD estejam inacessíveis por outras fontes autorizadas.

Foram baixados e decodificados **50 arquivos oficiais adicionais**: 30 thumbnails
64×64 dos criativos; 18 imagens 160×284, uma 160×160 e uma 160×200 de `video.picture`.
As origens estão separadas no manifesto. Nenhum desses arquivos atende HD e
nenhum foi usado para substituir o atual. Isso **não comprova ausência de HD**
na coleção completa: a investigação anterior demonstrou que essa inferência
seria incorreta.

O conector recusou `thumbnails` como campo não suportado. A sessão autorizada
Chrome/Graph Explorer que permitiu a auditoria inicial não respondeu às tentativas
de navegação, e a abertura do aplicativo terminou sem resposta à solicitação de
acesso do computador. A retomada dessa sessão foi solicitada ao responsável
enquanto a implementação independente continuava. Nenhuma credencial foi
extraída, copiada, alterada ou pedida ao usuário para contornar a indisponibilidade.
Os 33 ficam **pendentes de completar a coleção**, e não “sem fonte suficiente”.
Dimensões antigas nos metadados não foram apresentadas como arquivo real medido.

## Validação desta rodada

- 603 testes frontend e tipos frontend aprovados.
- 172 testes backend com transportes controlados; inclui coleção paginada,
  `preferred=false`, a décima candidata, HD absoluto, metadados errados, hash
  revisado, cache por conta, ciclos/limites, identidade, falhas de API/URL/Storage,
  idempotência e compare-and-set. Guard do #8 permanece coberto.
- Tipos dos módulos Edge de mídia aprovados; não houve deploy/homologação no runtime real.
- 15 testes Python dos utilitários aprovados.
- 11 verificações usando os 165 arquivos reais locais aprovadas.
- Playwright desktop 1440×1000 e mobile 390×844: cards 9:16, Top 3/9, modal 9:16,
  duas frentes de ensaio, recorte da apresentação e `contain`, sem erros JS,
  overflow horizontal ou chamadas externas. Galeria contém mídia real;
  ordem/métricas do ensaio são artificiais e sinalizadas.
- Quatro testes de empacotamento aprovados. Build Pages local verificado antes do push.

Os seis cenários Playwright versionados foram atualizados com verificações de
9:16 no card/modal e também executados com transportes controlados. As primeiras
rodadas tiveram timeout de 15 s antes de carregar os cards; o caso de Condomínios
mobile passou isoladamente. O registro da outra falha mostra a tela de preparação
do módulo lazy. A espera inicial por cards foi ajustada para até 45 s, mantendo
as mesmas condições de aceite e os tempos das verificações de mídia. Nenhum
comportamento do aplicativo ou causa de produção foi inferido/alterado para isso.
A navegação do ensaio aguarda `domcontentloaded` e depois as condições explícitas
dos cards/imagens, em vez de bloquear pelo evento global `load` de todos os recursos.
O trace confirmou requisições de módulos locais levando 18–22 s no servidor de
desenvolvimento. A validação final passou sobre build local já empacotado, com o
mesmo ambiente fictício e transportes controlados: **6 de 6 cenários passaram
juntos**. `tests/serve-meta-preview-test.mjs` compila em pasta de artefatos
ignorada e serve somente em 127.0.0.1; não publica a aplicação. O build inicial
fica fora do tempo de cada cenário, limitado a 180 s no setup.

Na nova verificação de disponibilidade após a instrução de continuar, o inventário
do navegador deixou de apresentar o Chrome autorizado. Permanecem disponíveis
apenas o navegador interno e MCP Apps. Isso mantém pendente a consulta completa
dos 33; não foi tentado transportar cookies ou credenciais entre navegadores.

O primeiro teste de geometria incluiu a transformação de inclinação dos cards;
foi corrigido para medir a caixa de layout sem confundir a inclinação já existente
com distorção da imagem. A nova moldura foi inspecionada em capturas reais.

## Artefatos locais e retomada

`artifacts/video-quality-review/` é privado/ignorado no Git: `galeria.html`,
`layout.html`, `cobertura.html`, `coverage44.json`, `real-policy-results.json`,
`remaining-mcp-media/measured.json`, capturas desktop/mobile e mídias reais.
Dados de cliente com URLs assinadas, arquivos de origem, tokens e cookies não
fazem parte do PR. A matriz sanitizada por anúncio está abaixo.

Para concluir os 33: retomar a sessão Graph Explorer autorizada, consultar os
IDs já identificados em lotes menores, exportar apenas campos de mídia sem
token/cookies/paging com credenciais, paginar completamente e medir com
`scripts/audit-meta-preview-hd.py`. Não reutilizar a suposição de que `picture`
160×284 representa o máximo disponível. Reaplicar o seletor, revisar os empates
visuais e atualizar a cobertura antes de qualquer lote real.

Sem novas migrations ou infraestrutura. Produção continua exigindo autorização
posterior específica para merge, deploy e lista de previews aprovados.
Reversão: código por revert autorizado; referências/metadados por manifesto
privado e CAS autorizado. Nenhum arquivo anterior deve ser excluído. Reverter
código sozinho não restaura referências já gravadas no banco.

## Matriz individual — dados reais e lacunas explícitas

| Caso / anúncio | Ad ID | Creative ID | Video ID | Melhor arquivo medido | Cobertura |
| --- | --- | --- | --- | --- | --- |
| 2 · CTV 1 - Depoimento | 120242449606530114 | 27098869879753839 | 1012468307793665 | 1080×1920 · video.thumbnails | preview_ja_adequado |
| 4 · CTV 2 - Depoimento | 120242449606540114 | 1707802983695247 | 1551126453079068 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 8 · CTV 2 - Depoimento | 120242449884590114 | 1759579785066730 | 1805970654116116 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 11 · CTV 2 - Depoimento | 120242449928760114 | 1533493221900400 | 1696445368289059 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 12 · CTV 1 - Depoimento | 120242449884570114 | 1700239187578272 | 1001401265906839 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 14 · CTV 1 - Depoimento | 120242449928770114 | 1648822456341685 | 1662801821595216 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 15 · CTV01 | 120246159821230114 | 1380678307194655 | 1632637051124343 | 720×1280 · video.thumbnails | HD |
| 16 · CTV02 | 120246161019030114 | 2166006714197904 | 1981790575800271 | 720×1280 · video.thumbnails | HD |
| 17 · CTV04 | 120246161118490114 | 848067684846149 | 789563380850233 | 720×1280 · video.thumbnails | HD |
| 18 · AD03 - Reels 1 | 120247146530830114 | 1531337995048758 | 960981666997388 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 19 · CTV03 | 120246161106180114 | 1343227177992383 | 28111052531819855 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 20 · CTV05 | 120246161125930114 | 852769597260317 | 971740078780540 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 21 · AD04 - Reels 2 | 120247146546260114 | 956663310760791 | 2266688140809168 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 22 · CTV04 - Mercado Autônomo para condomínio ou empresa | 120250585644990114 | 1409852014534495 | 1461479245749092 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 25 · CTV03 - A diferença entre mini mercado e conveniência gourmet — Cópia | 120250586751160114 | 1686838542568975 | 2058001751821916 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 27 · AD1  - VÍDEO ANDRÉ / ABF | 120251464544640114 | 1477205040928561 | 1361889016069140 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 28 · AD4 - Essa Historia | 120251464728120114 | 1686955422587466 | 2010361932935561 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 29 · AD5 - DEPOIMENTO FRANQUEADO | 120251464738740114 | 1346747380918180 | 2092319958309317 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 30 · CTV05 - Cansado de andar todos os dias até o mercado? | 120250588076190114 | 1343673761304006 | 991131187246339 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 31 · AD3 - Já Pensou | 120251464707830114 | 1590173029168125 | 3527806400713534 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 38 · AD1 - INVESTIMENTO ALTAMENTE | 120251464998300114 | 866753836293205 | 2420953245060082 | 720×1280 · video.thumbnails | HD |
| 39 · AD2 - GANHAR DINHEIRO EM 2026 | 120251465059580114 | 1366168292310658 | 1039154085157053 | 1080×1920 · video.thumbnails | Full HD |
| 41 · AD3 -  ESSA É A HISTÓRIA | 120251465070010114 | 1335745578281759 | 4511384709120746 | 1080×1920 · video.thumbnails | Full HD |
| 52 · AD3 - Mais do que uma franquia | 120251781898970114 | 1071980245374661 | 1095304406487964 | 1080×1920 · video.thumbnails | Full HD |
| 58 · AD1 -DIVERSOS VÍDEOS | 120252137218420114 | 1790636871963431 | 1044600535147299 | 160×160 · video.picture | pendente_colecao_thumbnails |
| 63 · AD06 - Reels 4 | 120250166237090114 | 2946053159119483 | 4369245209985958 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 64 · AD03 - Reels 1 | 120250166237110114 | 1531337995048758 | 960981666997388 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 65 · AD02 - Reels Chamada André | 120239022028440114 | 715220681640408 | 772944569130377 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 67 · AD05 - Reels 3 | 120250166237120114 | 3890427121259588 | 814965014756514 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 70 · AD04 - Reels 2 | 120250166237150114 | 970182916027076 | 1547927010182956 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 73 · AD4 - IMAGINA | 120252454489610114 | 2948007755548838 | 2115243459097778 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 74 · AD1 - ENTRE UMA REUNIÃO | 120252454201950114 | 2657925721378422 | 2363040967835865 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 75 · AD2 - FINAL DE SEMANA | 120252454414370114 | 1030492736695272 | 1055125747390694 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 76 · AD3 - PROXIMO PIT STOP | 120252454450800114 | 1657739492350480 | 2260101164888643 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 77 · AD5 - PERRENGUE | 120252454512730114 | 1432099395495855 | 1599811341590577 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 78 · AD6 - MELHOR MINI MERCADO | 120252454525840114 | 1631569098381794 | 933335529397804 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 102 · AD01 - | 120233201881890114 | 2153789125098930 | 1056861319992000 | 1080×1920 · video.thumbnails | Full HD |
| 105 · AD01 - | 120233201726040114 | 805756558555090 | 812346618014069 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 149 · C03 - Vale dinheiro | 120234317466560114 | 755005940704472 | 813205141391093 | 160×200 · video.picture | pendente_colecao_thumbnails |
| 163 · Novo anúncio de Engajamento | 120241847281150114 | 1894846637904718 | 1534826568138613 | 1080×1920 · video.thumbnails | Full HD |
| 179 · Novo anúncio de Engajamento — Cópia | 120242286711110114 | 2096610387765625 | 888940787119406 | 1072×1928 · video.thumbnails | HD |
| 183 · Post Nama | 120246017493640114 | 26666745216269332 | 937457092511524 | 64×64 · creative.thumbnail_url | pendente_colecao_thumbnails |
| 197 · AD05 - Reels 3 | 120247146554120114 | 3890427121259588 | 814965014756514 | 160×284 · video.picture | pendente_colecao_thumbnails |
| 198 · AD06 - Reels 4 | 120247146555820114 | 2946053159119483 | 4369245209985958 | 160×284 · video.picture | pendente_colecao_thumbnails |
