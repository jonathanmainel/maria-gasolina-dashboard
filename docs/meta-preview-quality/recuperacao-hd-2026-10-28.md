# Recuperação local de previews HD/Full HD — 11 anúncios Meta

> Evidência da investigação inicial. A implementação e cobertura posteriores
> estão em [padronização HD e cobertura](padronizacao-hd-e-cobertura-2026-10-28.md).
> O coletor agora incorpora o piso HD e a coleção paginada; os trechos de plano
> abaixo representam o estado anterior à nova aprovação de implementação.

28/10/2026. **Revisão visual humana pendente. Nenhum preview real atualizado.**
Este relatório substitui os resultados da revisão anterior de vídeo e galeria.
Worktree exclusiva `work/meta-creative-preview-quality`, branch
`codex/meta-creative-preview-quality`, HEAD `5cb5fe4`.
[PR #10](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/10)
consultado: aberto, draft e não integrado, com a base do #8 já integrada
(`37f3d785`). As mudanças desta rodada permanecem locais; não houve push.

## Resultado e diagnóstico

**6 candidatos Full HD, 5 HD, nenhum preview candidato abaixo de HD.**
São dez melhorias de resolução possíveis e um arquivo atual já Full HD, que deve
ser preservado. Isso não equivale à aprovação final nem ao acesso ao upload
original dos onze vídeos.

A principal descoberta foi consultar **todas as thumbnails do vídeo correto** e
medir os arquivos decodificados. Selecionar só `creative.thumbnail_url`, a capa,
o primeiro resultado ou o item `is_preferred` deixa escapar imagens melhores.
Dimensões declaradas pela Graph também não são prova da dimensão do arquivo:

- Multifranqueada: thumbnail #9 declarada 480×864, arquivo **1072×1928**.
- Ganhar dinheiro: thumbnail preferida declarada 1080×1920, arquivo 720×1280;
  outras thumbnails do mesmo vídeo são efetivamente 1080×1920.
- Investimento: preferida efetiva 480×854, alternativa efetiva 720×1280.
- Tour: formato declarado 4320×7680 não corresponde ao MP4 servido, 360×640;
  uma thumbnail não preferida mede realmente 1080×1920.

Foram baixadas e inteiramente decodificadas **165 thumbnails dos 11 vídeos**,
com bytes, SHA-256 e dimensões registrados. A paginação retornou encerrada para
todos. Mais duas thumbnails de uma publicação alternativa foram examinadas
separadamente; seu ID não entra automaticamente na allowlist dos anúncios.
Não houve upscale, alteração de parâmetros da CDN para forçar dimensões,
reconstrução por IA ou captura de tela apresentada como mídia Full HD.

## Matriz individual

Todas as linhas pertencem ao cliente 1, conta `1063721474298569` (Maria Gasolina
Express). Dimensões abaixo são de arquivos reais, não atributos HTML.
Fonte escolhida: `/{video_id}/thumbnails`, CDN oficial, validada individualmente.
Ela representa o vídeo e **não comprova um posicionamento de entrega**.

| Caso / anúncio | Atual | Melhor thumbnail | Melhor vídeo/frame acessível | Frame de comparação | Resultado / decisão |
| --- | --- | --- | --- | --- | --- |
| 2 · CTV 1 – Depoimento | 1080×1920 | 1080×1920 | 1080×1920 | 2 s | Full HD; manter atual, sem ganho de resolução |
| 15 · CTV01 (dinâmico) | 64×64 | 720×1280 | 720×1280 | 0,5 s | HD; candidato da própria peça |
| 16 · CTV02 (dinâmico) | 64×64 | 720×1280 | 720×1280 | 2 s | HD; candidato da própria peça |
| 17 · CTV04 (dinâmico) | 64×64 | 720×1280 | 720×1280 | 3 s | HD; pessoa/loja, sem usar asset de CTV02 |
| 38 · Investimento altamente | 160×285 | 720×1280 | 720×1280 | 1,5 s | HD; thumbnail #6, sem transição |
| 39 · Ganhar dinheiro em 2026 | 64×64 | 1080×1920 | 720×1280 | 3 s | Full HD; thumbnail #4, pessoa e texto |
| 41 · Essa é a história | 160×284 | 1080×1920 | 720×1280 | 2 s | Full HD; capa com mensagem do próprio vídeo |
| 52 · Mais do que uma franquia | 64×64 | 1080×1920 | 720×1280 | 0,5 s | Full HD; thumbnail #8 vinculada ao próprio ID |
| 102 · AD01 / receita Nescafé | 64×64 | 1080×1920 | 1080×1920 | 3 s | Full HD; receita e identidade legíveis |
| 163 · Engajamento / tour | 64×64 | 1080×1920 | 360×640 | 2 s | Full HD da thumbnail #10; rejeitar frame pequeno |
| 179 · Engajamento – Cópia / Daniela | 64×64 | 1072×1928 | 480×864 | 3 s | HD da thumbnail #9; rejeitar frame pequeno |

São **2 vídeos/frames Full HD, 7 HD e 2 inferiores a HD**. As thumbnails resolvem
os dois últimos previews; não houve recuperação de vídeo HD nesses casos.
1072×1928 está classificado como HD, porque a largura não chega aos 1080 px.
Todos os candidatos escolhidos foram inspecionados quanto à pessoa, loja,
marca/produto, texto quando presente, distorção e transição. Revisão humana do
cliente permanece obrigatória; dimensões sozinhas não aprovam uma imagem.

| Caso | ID anúncio | ID criativo | ID vídeo | Frente pela regra atual |
| --- | --- | --- | --- | --- |
| 2 | 120242449606530114 | 27098869879753839 | 1012468307793665 | Franquias |
| 15 | 120246159821230114 | 1380678307194655 | 1632637051124343 | Franquias |
| 16 | 120246161019030114 | 2166006714197904 | 1981790575800271 | Franquias |
| 17 | 120246161118490114 | 848067684846149 | 789563380850233 | Franquias |
| 38 | 120251464998300114 | 866753836293205 | 2420953245060082 | Franquias |
| 39 | 120251465059580114 | 1366168292310658 | 1039154085157053 | Franquias |
| 41 | 120251465070010114 | 1335745578281759 | 4511384709120746 | Franquias |
| 52 | 120251781898970114 | 1071980245374661 | 1095304406487964 | Franquias |
| 102 | 120233201881890114 | 2153789125098930 | 1056861319992000 | Não classificado |
| 163 | 120241847281150114 | 1894846637904718 | 1534826568138613 | Não classificado |
| 179 | 120242286711110114 | 2096610387765625 | 888940787119406 | Não classificado |

O classificador usa o nome da campanha. Não foi atribuído Condomínios ao caso
102 apenas porque essa palavra aparece no conjunto. A galeria contém campanha,
tipo e conta. Os vídeos são verticais: 9:16, exceto 179 aproximadamente 5:9;
1072×1928 preserva a proporção deste último. Nenhum recorte ou esticamento aplicado.

## Posicionamentos e fontes oficiais

Foram geradas **66 prévias novas** pela Marketing API, seis por anúncio, e
navegadas na sessão autorizada: Instagram Stories, Instagram Reels, Facebook
Stories, Facebook Reels, Instagram Feed e Facebook Feed. Formatos estão no
[SDK oficial de AdPreview](https://raw.githubusercontent.com/facebook/facebook-python-business-sdk/main/facebook_business/adobjects/adpreview.py).
A galeria contém os 66 links oficiais e a matriz detalhada das observações.

- 57 prévias tiveram dimensões de vídeo verificadas: 14 com reprodução em curso,
  11 carregadas e pausadas e 32 carregadas sem registrar estado de reprodução.
- 7 apresentaram validação de formato/mídia: quatro no caso 179 e três Instagram
  no caso 163 (código 2446429).
- 2 leituras ficaram incompletas por interrupções da sessão de navegador:
  Instagram Stories de 16 e 39. A prévia foi gerada/tentada, mas não se declara
  playback nem indisponibilidade nesses dois pontos. Os respectivos MP4 HD e as
  imagens HD/Full HD foram confirmados por outras fontes da mesma peça.

O período de insights consultado foi de últimos 90 dias. O manifesto distingue
posicionamentos que realmente retornaram impressões daqueles apenas geráveis
na prévia. Casos 102, 163 e 179 não retornaram posicionamento/impressões no
período; isso não nega veiculação anterior.

A biblioteca de vídeos da conta foi paginada até o fim: 123 registros. Quatro IDs
da amostra foram resolvidos ali; os sete restantes não. Nenhum motivo específico
de permissão foi inferido dessa ausência. A descoberta de contas Instagram pelo
conector retornou vazia; a interface oficial Business Suite mostrou o ativo,
permitindo examinar a publicação correspondente sem inventar IDs.

O [SDK oficial AdVideo](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/advideo.py)
define `source` e `format`. A leitura GET na Graph API v23.0, pela sessão já
autorizada do Graph Explorer, solicitou `source,format,picture,permalink_url` e
`thumbnails{uri,width,height,is_preferred}` para os onze IDs e a publicação
alternativa. **`source` não foi retornado**, sem erro específico. Não se conclui
que a causa seja falta de permissão, nem que o token do coletor terá o mesmo
resultado. Não se leu, copiou, gerou ou alterou token, escopo ou credencial.

As prévias oficiais expõem MP4 reproduzíveis da CDN Meta. Esses arquivos foram
baixados temporariamente e decodificados. São versões servidas pela plataforma,
não uploads originais comprovados. FFmpeg local extraiu 55 frames, entre 0,5 e
3 s, mantendo resolução nativa; nenhum filtro de escala foi aplicado.

## Caso Daniela / multifranqueada, investigação reaberta

Todas as seis prévias foram tentadas novamente. Instagram Stories/Reels/Feed e
Facebook Stories recusaram a representação por largura inferior a 500 px;
Facebook Reels carregou 480×864 e Facebook Feed apresentou a mesma mídia.
O MP4 local decodifica em 480×864.

Também foram verificadas estas fontes oficiais:

| Fonte | Evidência | Maior vídeo confirmado |
| --- | --- | --- |
| Graph do vídeo 888940787119406 | `source` ausente; 11 thumbnails decodificadas | formato declarado 480×864 |
| Biblioteca da conta | 123 registros, ID não localizado | não confirmado |
| [Publicação Facebook](https://www.facebook.com/100069822541023/posts/888940787119406/) | Daniela, mesma história; seleção HD do player não mudou as dimensões reais | 480×864 |
| Business Suite, página 102116115446914 | publicação correspondente de 27/01/2026; conta correta selecionada | 480×864 |
| [Reel Facebook correspondente](https://facebook.com/reel/1602635897576215/) | mesmo conteúdo, duração aproximada 90,2 s; ativo alternativo analisado separadamente | 480×864 |
| [Reel Instagram correspondente](https://www.instagram.com/reel/DUAv2e0EQ8c/) | mesmo conteúdo, pessoa e duração | 480×864 |
| Download oficial na Business Suite | Facebook oferece “Baixar”, mas arquivo original superior não foi obtido; Instagram não ofereceu essa opção | não confirmou melhoria |
| Arquivo original do cliente | usuário informou não localizado | indisponível |

O resultado decisivo é a thumbnail **#9 do próprio vídeo 888940787119406**:
1072×1928, SHA e bytes registrados, pessoa/loja/marca conferidas no arquivo
completo e no modal. A declaração 480×864 da API teria descartado essa opção.
Os outros dez arquivos também foram medidos; o segundo maior mede 640×1152.
A imagem HD atende ao mínimo proposto para o preview; o vídeo HD original
continua não confirmado. Se o objetivo passar a incluir vídeo original ou Full
HD estrito deste caso, o caminho alternativo é solicitar o export original ao
cliente/editor ou localizar seu arquivo autorizado; não ampliar o MP4 480×864.

## Método replicável e limites locais

O utilitário `scripts/audit-meta-preview-hd.py` recebe uma lista explícita de
anúncio/criativo/vídeo/conta e uma exportação sanitizada dos campos oficiais.
Não contém credenciais, não chama endpoints privados, não escreve no Supabase e
não aceita um vídeo diferente apenas porque o nome ou a pessoa coincidem.

1. Conferir cliente, conta, anúncio, criativo e asset original por leitura.
2. Consultar todas as thumbnails oficiais, seguindo paginação; preservar
   `is_preferred` como metadado, sem excluir alternativas pela preferência ou
   dimensão declarada. Deduplicar fontes.
3. Baixar apenas HTTPS de CDN Meta permitida; validar cada redirecionamento
   antes de segui-lo. Limites: 3 workers, 10 MiB/imagem, 40 milhões de pixels,
   15 s por operação, prazo verificado durante leitura, 50 candidatos/vídeo e
   250/lote. Dividir inventários maiores em lotes explícitos.
4. Decodificar o arquivo inteiro com Pillow; registrar SHA, bytes, dimensões,
   origem, índices e proprietários. Sem proporção original confirmada, medir
   pixels, mas não declarar qualidade/proporção aprovada automaticamente.
5. Comparar alternativas da mesma peça, com qualidade absoluta e inspeção
   visual, depois comparar ao preview privado existente. Manter o atual se já
   atende e não há melhoria inequívoca, ou se o candidato falhar/for inferior.
6. Usar frame apenas se faltar thumbnail satisfatória e houver vídeo autorizado
   suficiente. Extrair sem escala em 0,5/1/1,5/2/3 s, ampliar busca se necessário.
   Rejeitar preto, transição, desfoque, UI e identidade incorreta.
7. Gerar manifesto e galeria privados para revisão. Não vincular esses arquivos
   ao banco automaticamente. Aprovação visual é separada da classificação de pixels.

Exemplo de execução local, usando Python com Pillow disponível:

```powershell
python -B scripts/audit-meta-preview-hd.py --cases artifacts/video-quality-review/cases.json --evidence artifacts/video-quality-review/graph-evidence-private.json --output artifacts/video-quality-review/all-thumbnails
python -B -m unittest discover -s tests -p test_meta_preview_hd_audit.py -v
```

Formato do input: `cases.json` contém objetos com `ad_id`, `creative_id`,
`video_id` e `account_id` numéricos em strings. Evidência contém `videos`, cada
um com `video_id`, `formats` (`filter,width,height`) e `thumbnails`
(`uri,width,height,is_preferred`). Tokens, cookies e links de paginação com
credenciais nunca entram na exportação. URIs CDN assinadas ficam apenas em
arquivos locais ignorados; não devem ser versionadas nem copiadas para o PR.

O cache considera identidade da URL e parâmetros de transformação, ignorando
assinaturas temporárias. Reordenação de resultados não reaproveita o arquivo de
outro índice. Reexecução desta amostra: **165 arquivos revalidados/reutilizados,
zero novos downloads**. Cache local não substitui a revisão de identidade ao
preparar uma futura atualização real.

Critério vertical: Full HD ≥1080×1920; HD ≥720×1280; ambos os eixos precisam
atingir o piso. Tolerância de proporção 3,5%, sem recortar/esticar. Quadrado,
4:5 e paisagem preservam a orientação com pisos equivalentes explícitos.
160×284, 480×864 e 720×1279 não são promovidos a HD. Imagem com pixels
suficientes ainda depende de nitidez, cobertura, identidade e legibilidade.

## Galeria e verificações

Servidor local em `http://127.0.0.1:4198/artifacts/video-quality-review/galeria.html`.
Arquivos reais ficam em `artifacts/video-quality-review/`, ignorados no Git:

- `galeria.html` e `manifest.json`: todos os 11, atual/thumbnail/frame,
  resolução real, origem, frame, conta/frente, entrega observada e decisão.
- `layout.html?case=179`: componentes reais importados do dashboard;
  seletores de anúncio, atual/thumbnail/frame/recomendado, Top 3/Top 9,
  modal, contexto de frente e recorte da apresentação.
- `position-links.html` / `position-matrix.html`: 66 links e resultados por
  posicionamento, distinguindo playback, carregamento, erro e pendência.
- `all-thumbnails/measured.json`: 165 hashes/dimensões/identidades reais.
- `native-frames.json`, `frames-*.jpg`, `choices-*.jpg`: frames e alternativas.
- `expansion-plan.json`: 44 registros, 11 auditados e 33 aguardando auditoria.
- `verification.json`, `layout-*.png`, `modal-*.png`, `top9-*.png` e
  `apresentacao-*.png`: verificação desktop/mobile com a nova imagem da Daniela.
- `gallery-verification.json`: 11 seções/33 imagens reais carregadas e
  decodificadas no navegador, sem overflow de página em 1440 e 390 px.
- `daniela-atual-thumbnail-frame.png`: comparação visual dos três arquivos.

Métricas zeradas e ordem do ensaio são artificiais e estão sinalizadas. A mídia
é real. Trocar “Condomínios” no ensaio só verifica o contexto visual, não atribui
os anúncios a essa frente. Apresentação é um recorte da seção de criativos;
isso não homologa a aplicação autenticada de produção.

Validação desta rodada: 12 testes Python; 8 testes frontend de card/modal;
`tsc --noEmit` aprovado; Playwright 1440×1000 e 390×844,
Top 3/9, modal, dois contextos e seção de apresentação, sem erro JS, overflow
horizontal ou requisição externa. Hashes de todos os atuais/variantes conferidos.
Os testes anteriores de Graph/Storage/CAS do PR permanecem evidência de
transportes controlados, não substituem os arquivos reais desta galeria.
Uma execução no sandbox falhou no acesso às pastas temporárias do Windows;
os 12 testes passaram na execução local com esse acesso. A captura inicial da
galeria revelou texto com `<` sem escape no gerador HTML; corrigido e validado
no navegador. Esses problemas não alteraram arquivos ou dados de produção.

A remoção das dimensões dos cards solicitada pelo usuário está aplicada
localmente em `FrontView.tsx`; o aviso de baixa resolução e o modal permanecem.

## Expansão, implementação futura e reversão

Leitura do inventário reconfirmada: 27 vídeos e 17 dinâmicos identificados como
vídeo, total 44. Há 40 com `metadata.video_id` e quatro dinâmicos apenas com
`object_type=VIDEO` (22,63,64,67); descobrir o ID autorizado da própria peça
antes de incluí-los na lista. Os onze da amostra deixam **33 para auditoria
local posterior**, sem promessa de que todos tenham HD acessível.

O utilitário e esta galeria estabelecem o procedimento local. **O coletor do
PR #10 ainda não implementa o novo piso absoluto HD**: não deve ser publicado
como está para esse requisito. Após a revisão humana, a mudança concentrada no
enriquecimento deverá retirar a preferência excludente baseada no metadado,
comparar os bytes da mesma peça, exigir piso absoluto no modo seletivo de vídeo
e manter os guards, CAS, hash, metadados e arquivos anteriores. Não é necessário
FFmpeg recorrente: os onze já têm thumbnail suficiente, e frame fica como
alternativa explícita quando fizer sentido.

Sem necessidade técnica demonstrada de migration, novo bucket, fila, cron ou
serviço permanente. Antes de produção: revisão das escolhas, aprovação da
adaptação do coletor, homologação isolada com suas credenciais atuais e depois
autorização específica de merge/deploy e do lote de gravação dos IDs aprovados.
Esta rodada não fez nenhuma dessas ações.

Futura atualização seletiva: manifesto privado com cliente/conta/IDs/caminho,
hash/metadados/timestamps anteriores; revalidar a identidade e comparar o atual;
upload imutável somente do candidato aprovado; compare-and-set das referências;
em falha, inferioridade ou conflito, manter o anterior. Conferir primeiro lote
pequeno e só expandir mediante revisão. Nunca apagar o arquivo anterior.
Reversão de mídia restaura referências/metadados do manifesto com CAS e
autorização de escrita; revert de código não restaura o banco. Nenhuma mudança
de métrica, ranking, RLS, credencial, cron, guard ou coletor Google/GA4 prevista.

**Ponto de parada:** galeria e método local entregues para revisão humana.
As dez substituições possíveis continuam sem autorização de produção.
