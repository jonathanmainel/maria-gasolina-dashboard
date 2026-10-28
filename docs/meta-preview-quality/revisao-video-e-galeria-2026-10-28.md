# Previews de vídeo — requisito revisado e evidências locais

> Registro histórico, superado pela [recuperação HD/Full HD](recuperacao-hd-2026-10-28.md).
> A investigação foi reaberta: os 11 anúncios agora têm imagem candidata HD ou
> Full HD real, incluindo a multifranqueada. Os limites abaixo descrevem a rodada
> anterior e não o resultado atual. O vídeo original HD continua sem confirmação.

Data: 28/10/2026. Revisão humana pendente. Esta entrega encerra a investigação e
a preparação da galeria, sem implementar/publicar o novo fluxo de vídeo.
O pedido posterior de remover as dimensões dos cards foi aplicado localmente:
o aviso de baixa resolução e as informações do modal foram preservados.

Worktree exclusiva: `work/meta-creative-preview-quality`.
Branch: `codex/meta-creative-preview-quality`, base `5cb5fe4`.
O [PR #10](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/10)
permanece referência da implementação anterior. Ela **ainda não atende ao novo
critério mínimo**: `improves` compara resolução relativa, mas não impede que
160×284 seja a melhor candidata de uma tentativa. Os testes anteriores não
constituem aprovação do novo requisito.

## Resultado técnico

- O conector `ads_get_ad_videos` disponível nesta sessão não expõe `source` nem
  URL de download de vídeo entre seus campos suportados. Nos nove IDs iniciais,
  quatro vídeos foram resolvidos e cinco não; essa ausência não identifica uma
  causa específica de permissão. A descoberta de contas Instagram retornou lista
  vazia; não foi tentada consulta por conta inventada.
- O [SDK oficial da Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/advideo.py)
  define o campo `source`. Isso comprova a existência do campo na interface do
  SDK, **não** que o token/objeto atual possa retorná-lo, nem que seja o upload
  original em 1080×1920. Essa leitura direta com a credencial do coletor não foi
  comprovada nesta etapa. Nenhum token foi extraído do navegador ou alterado.
- A ferramenta oficial `ads_get_ad_preview` forneceu uma prévia de cada anúncio.
  No navegador autenticado, a mídia efetivamente exposta pelo elemento de vídeo
  permitiu baixar versões MP4 da CDN oficial da Meta. Trata-se de **mídia servida
  para reprodução**, com tags como `compressed_source` e
  `progressive_h264-basic-gen2_720p`; não foi comprovado acesso ao arquivo original.
- Foram baixados quatro MP4 distintos que representam cinco anúncios:
  CTV01, CTV04, Investimento altamente e a mídia compartilhada, segundo a própria
  prévia Meta, por Ganhar dinheiro / Mais do que uma franquia. Todos decodificam
  em 720×1280. Os frames de 0, 0,5 e 1 segundo preservam essas dimensões; nenhum
  comando contém filtro de escala ou reconstrução por IA.
- FFmpeg local funcionou, usando o binário do pacote `imageio-ffmpeg==0.6.0`,
  instalado apenas na pasta ignorada da auditoria. Sem serviço, fila, cron,
  dependência da aplicação ou infraestrutura permanente adicional.
- Multifranqueada: a prévia de Reels informa mídia com menos de 500 px de largura.
  A alternativa oficial Facebook exibiu vídeo 480×864, com duração aproximada
  de 90 s; seu download não concluiu. A capa baixada mede 480×854. Não existe
  fonte aceitável comprovada para esse caso nesta investigação.

As URLs temporárias foram utilizadas como recebidas da Meta, sem manipular
parâmetros para simular HD. Downloads usaram HTTPS e hosts oficiais observados.
Timeout de download não foi tratado como negativa de permissão.

## Fontes melhores confirmadas

O retorno da prévia oficial também trouxe `creative.image_hash`; a consulta
autorizada desse hash em `adimages` forneceu capas reais. Os bytes foram
baixados e decodificados por completo com Pillow, registrando dimensões/hash.
As onze capas se dividem em três de 1080×1920, seis de 720×1280 e duas de
480×854. Capa alta não garante representação adequada: CTV04 tem capa 720×1280
com logo genérico e deve usar frame da própria peça.

Os anúncios Ganhar dinheiro e Mais do que uma franquia retornam o mesmo
`image_hash` de capa e a mesma URL de arquivo MP4 (desconsiderando assinatura).
A associação foi observada nas duas prévias oficiais; não foi inferida apenas
por semelhança visual ou reutilização local de arquivo. O manifesto mantém os
IDs próprios dos dois anúncios. A preferência editorial entre capa e frame
continua pendente de revisão humana.

## Critério de aceite proposto

Para as peças verticais 9:16 desta amostra:

| Classe técnica proposta | Requisito |
| --- | --- |
| Aprovado | 1080×1920 ou superior, nitidez e identidade corretas |
| Aceitável, sujeito a aprovação humana | Pelo menos 720×1280, sem upscale, com sujeito/texto relevante legíveis nos componentes reais |
| Insuficiente | Abaixo de 720×1280, incluindo 160×284 e 480×854; ou capa genérica/frame borrado/preto/cortado/peça incorreta, independentemente dos pixels |
| Indisponível | Nenhuma fonte autorizada obtida/validada; conservar arquivo anterior e registrar motivo |

Não converter essa proposta em aprovação automática. Se o requisito escolhido
for **1080×1920 obrigatório**, apenas duas novas melhorias desta amostra cumprem
o piso; os sete casos em 720×1280 permanecem pendentes.

A proporção deve seguir a mídia real da peça, com tolerância proposta de até
3,5% para diferenças de arredondamento. Não usar o quadrado 64×64 anterior como
referência da proporção do vídeo. Para outras proporções, definir o piso próprio
antes de aplicar; não cortar vídeos quadrados/4:5 para forçar 9:16.
Mostrar a imagem completa, sem distorção. Rejeitar frames de transição/pretos ou
focados apenas no logo quando não representam a peça. Revisão humana deve
examinar rosto, produto, texto relevante e leitura no modal/apresentação.

## Resultado por anúncio

As classes abaixo são recomendações técnicas; nenhuma substituição foi aprovada
ou executada em produção.

| ID local / anúncio | Atual, medido | Capa Meta, medida | Frame local | Recomendação |
| --- | --- | --- | --- | --- |
| 2 · CTV 1 - Depoimento | 1080×1920 | 1080×1920, hash igual | Não extraído: capa priorizada | Aprovado; preservar o atual |
| 15 · CTV01 | 64×64 | 720×1280 | 720×1280, 0/0,5/1 s | Aceitável; priorizar capa representativa |
| 16 · CTV02 | 64×64 | 720×1280 | Não extraído: capa priorizada | Aceitável; capa |
| 17 · CTV04 | 64×64 | 720×1280, logo genérico | 720×1280, 0/0,5/1 s | Aceitável; frame de 1 s |
| 38 · Investimento altamente | 160×285 | 480×854 | 720×1280, 0/0,5/1 s | Aceitável; frame de 1 s |
| 39 · Ganhar dinheiro em 2026 | 64×64 | 720×1280 | 720×1280, mesma mídia da prévia do 52 | Aceitável; capa, sujeito à revisão editorial |
| 41 · Essa é a história | 160×284 | 1080×1920 | Não extraído: capa priorizada | Aprovado; capa |
| 52 · Mais do que uma franquia | 64×64 | 720×1280 | 720×1280, 0/0,5/1 s | Aceitável; capa ou frame, escolha humana |
| 102 · AD01 (Nescafé) | 64×64 | 1080×1920 | Não extraído: capa priorizada | Aprovado; capa |
| 163 · Engajamento (tour) | 64×64 | 720×1280 | Não extraído: capa priorizada | Aceitável; capa |
| 179 · Engajamento — Cópia (multifranqueada) | 64×64 | 480×854 | Não obtido; reprodução observada 480×864 | Insuficiente; preservar atual, solicitar fonte original/HD |

São **9 melhorias potenciais**, sendo 6 anúncios classificados como vídeo e
3 dinâmicos de vídeo; 1 controle já correto; 1 caso insuficiente. Com o piso
ideal 1080×1920 obrigatório, são 2 melhorias confirmadas e 7 intermediárias.
Nos cinco vídeos de baixa resolução antes conhecidos, quatro têm alternativa
acima do mínimo condicional; multifranqueada continua sem solução aceitável.

O inventário total foi relido: 27 vídeos disponíveis, 77 dinâmicos disponíveis,
40 imagens disponíveis e 1 desconhecido indisponível. A galeria é uma amostra
dirigida de 11 anúncios, não uma medição completa dos 144 previews disponíveis.
Na amostra há 10 arquivos atuais insuficientes: 7 de vídeo e 3 dinâmicos.
Dimensão ausente no restante do inventário continua sendo desconhecida.

## Galeria e validação

Artefatos privados, ignorados pelo Git, na worktree exclusiva:

- `artifacts/video-quality-review/galeria.html`: abre com arquivos locais;
  comparação lado a lado, dimensão, hash, classe e disponibilidade por variante.
- `manifest.json`: vínculo anúncio/creative/vídeo, referência atual, SHA-256,
  bytes e dimensões reais das variantes; revisão humana marcada pendente.
- `layout.html` / `layout.tsx`: ensaio local que importa `CreativeRanking`,
  `CreativeCard`, modal e CSS existentes, sem reimplementá-los. Servidor somente
  em `http://127.0.0.1:4198/artifacts/video-quality-review/layout.html`.
- Capturas `layout-*-atual.png`, `layout-*-recomendado.png`, `top9-*.png`,
  `modal-*.png`, `apresentacao-*.png`; comparativo geral `comparacao-real.jpg`.
- `verification.json`: Playwright em 1440×1000 e 390×844, hashes atuais,
  Top 3/Top 9, modal, dois contextos e recorte da apresentação. Rede externa
  bloqueada, sem erros JavaScript ou transbordamento horizontal nesses ensaios.

Após retirar as dimensões dos cards, os dois arquivos de testes existentes de
cards/modal passaram: **11 testes**. A validação Playwright local acima foi
repetida com as novas capturas. O aviso de baixa resolução continua nos cards;
as dimensões continuam no modal e na galeria técnica. A primeira tentativa de
unitários encontrou uma falha de arquivo temporário do ambiente isolado; a
execução completa fora desse isolamento terminou aprovada. Isso não foi
interpretado como defeito do produto ou como teste aprovado na tentativa falha.

O ensaio usa imagens reais. Sua ordem e métricas zeradas são artificiais,
explicitamente rotuladas. Alternar o contexto Condomínios não afirma que os
anúncios da amostra pertencem àquela frente; apenas exercita os mesmos cards.
A apresentação é o recorte da seção de criativos com o CSS existente, não
homologação da apresentação autenticada inteira. Também foi lido o Top 3/9
autenticado de Franquias, sem acionar sincronização.

Os onze arquivos atuais foram recuperados por leitura do bucket/dashboard ou
comparação de bytes idênticos já obtidos da Meta; **todos** correspondem ao
SHA-256 persistido. Isso evita substituir evidência real por fixture.
Mídia, vídeos, assinaturas e respostas brutas não devem ser versionados ou
publicados. O HTML local inclui links temporários oficiais; tratar a pasta
como material privado de revisão.

## Plano revisado — aguarda aprovação

1. Adicionar um critério absoluto de qualidade para vídeo **além** da comparação
   contra o atual. Se nenhum candidato alcançar o piso aprovado, conservar
   dimensões, referências, bytes e demais metadados anteriores e registrar
   `insufficient_quality`. Nunca promover 160×284 apenas por superar 64×64.
2. Priorizar capas oficiais por hash e thumbnails validadas da **mesma peça**.
   Cobrir payloads incompletos: preservar metadados e não adotar capa de outro
   asset do dinâmico por ter maior resolução. O `image_hash` obtido pela prévia
   MCP nesta auditoria não garante que o mesmo campo apareça no payload usado
   pelo coletor; confirmar a resolução do vínculo antes de automatizar.
3. Quando capa for insuficiente, oferecer ferramenta **local e explícita** de
   extração: lista nominal de anúncio/creative/video, arquivo ou URL autorizada,
   downloads limitados, timeout e arquivo temporário; avaliar 0, 0,5 e 1 s,
   preservar proporção e rejeitar frame preto/desfocado. Não tentar converter
   FFmpeg em processamento da Edge Function ou adicionar serviço permanente.
4. Manter aquisição assistida da mídia quando o conector não oferece download
   próprio: prévia oficial/arquivo fornecido pelo responsável. A leitura do DOM
   autenticado provou a viabilidade local, mas não é um contrato estável para
   cron/produção. Preferir `source` via API apenas se acesso real for confirmado,
   sem ampliar permissões. URL expirada/falha → preservar e relatar.
5. Gerar manifesto seco com hashes do vídeo/frame/preview atual, instante do
   frame, identidade, resolução, origem, versão da política e decisão. Revisar
   a galeria e aprovar nominalmente os arquivos finais. Reutilizar hash igual,
   sem download/processamento recorrente de itens já resolvidos.
6. Preparar importação seletiva separada, inicialmente sem escrita. Se aprovada
   depois, usar armazenamento privado com novos caminhos por hash, preservar
   objetos anteriores e comparar o estado atual com o manifesto antes de gravar
   (se outra sessão alterar a referência, abortar item). Reutilizar guard e
   autorização existentes; não alterar cron, métricas, ranking ou coletores.
7. Testar piso absoluto (64→160 recusado; 160→480 recusado; 720 condicional;
   1080 aprovado), dimensões reais/ausentes, origem expirada, vídeo indisponível,
   frame inválido, representação dinâmica, idempotência, permissões e falhas de
   Storage/persistência. Testes anteriores continuam necessários, mas não
   substituem essa cobertura nova nem a revisão dos arquivos reais.

TypeScript no enriquecimento continua adequado para seleção/persistência;
FFmpeg local resolve decodificação só nos casos selecionados. O trade-off é
uma etapa assistida de aquisição/revisão, em troca de evitar uma infraestrutura
permanente de vídeo e dependência de sessões autenticadas no coletor.
Upscale, reconstrução por IA, alteração de query CDN, bucket público, scraping
recorrente e automação no navegador dentro do cron foram descartados.

Não há necessidade demonstrada de migration: origem, decisão e versão podem
usar `metadata` e campos existentes. Histórico ilimitado não está proposto.
Reversão futura: restaurar referências/metadados do manifesto prévio, com
autorização de escrita própria, mantendo os objetos antigos intactos.

## Limites e estado final

Nenhum deploy, merge, migration, upload/exclusão no Storage, atualização de
preview real, alteração de credencial/permissão ou cron. Nenhuma modificação na
worktree da outra sessão. PR #8 integrado já preservado na base desta branch.
A nova extração não foi incorporada ao produto. Somente os scripts/galeria
locais demonstram a viabilidade; o pedido de ocultar dimensões dos cards é a
única alteração funcional posterior a esta revisão.

Próxima autorização: aprovar/revisar o piso condicional 720×1280, as imagens por
anúncio e o plano local seletivo. Isso não autoriza produção. Publicação de código
e escrita nominal de previews reais exigem autorizações posteriores próprias.
