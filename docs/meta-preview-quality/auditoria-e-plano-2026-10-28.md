# Previews Meta Ads — auditoria e proposta para aprovação

Registro da auditoria anterior à aprovação. A implementação local aprovada e os
resultados posteriores estão em [implementação e publicação](implementacao-e-publicacao.md).

Data: 28/10/2026. Repositório: `jonathanmainel/maria-gasolina-dashboard`.
Produção consultada: `hlqrpreqvvxtkruwsolg`, exclusivamente por leitura.

## Estado desta entrega

Auditoria de código, schema, inventário, Storage e amostras da Meta realizada.
Nenhum código funcional foi alterado. Implementação, novos testes e PR aguardam
aprovação do plano, conforme o AGENTS.md fornecido pelo responsável.
Não houve chamada ao coletor, sincronização, escrita de dados, upload/exclusão
no Storage, migration, deploy, merge, alteração de credenciais ou cron.

Worktree exclusiva:
`C:/Users/GAMER/Documents/ChatGPT/Profissional/work/meta-creative-preview-quality`.
Branch: `codex/meta-creative-preview-quality`.
Base da worktree: `1168f9f1890178295ab850fddcf2d01b3e389c53`.
Durante a auditoria, `origin/main` avançou para `572fe57c61451c7a48a34fa351a8e422ac68bbbe`
(integração do PR #9, Service Account). Essa integração foi realizada fora desta
frente. A branch ainda aponta à base inicial e será atualizada antes da implementação;
a reconciliação com o #8 continua pendente da integração dele.
O app recusou criar a worktree por limitar sourceRoot aos diretórios anexados;
foi criada com `git worktree add`. Só o registro compartilhado do Git e o novo
diretório foram escritos. Os arquivos dos checkouts anteriores não foram alterados.

## Histórico consultado

Foram lidos descrição, estado e diff dos quatro PRs solicitados.

| PR | Estado confirmado | Escopo a preservar |
| --- | --- | --- |
| [#3](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/3) | Integrado, merge `53d983d4` | Recarga por leitura, modal, proporção, métricas e avisos |
| [#4](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/4) | Integrado, merge `9e492cb6` | Apresentação responsiva, dimensões decodificadas, URLs assinadas |
| [#6](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/6) | Integrado, merge `1168f9f1` | Permissões comerciais e comportamento por frente |
| [#8](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/8) | Aberto, Draft, não integrado na última consulta | Guards e sincronização manual; trabalho independente |

O #8 iniciou esta auditoria na base `codex/google-ads-service-account`; após a
integração do #9, a última consulta mostrou sua base em `main`, ainda aberto,
head `83c047c1f29e98701d6d5fb97f8fc39531268906`. Em `meta-creative.ts`, seu diff
contém duas correções de tipos: exclusão de `url` no `Omit` de candidatos e
`Uint8Array<ArrayBuffer>` em `sha256`. Devem ser preservadas na reconciliação.
O `index.ts` importa `authorizeCollection` e participa do protocolo de reserva;
não deve ser substituído pela versão atual desta base.

## Inventário real reconfirmado

| Tipo | Disponíveis | Sem dimensões registradas | Objetos presentes no Storage |
| --- | ---: | ---: | ---: |
| Vídeo | 27 | 12 | 27 |
| Dinâmico | 77 | 77 | 77 |
| Imagem | 40 | 40 | 40 |
| Desconhecido/indisponível | 0 de 1 | 1 | 0 |

Detalhamento dos 27 vídeos, conforme metadados persistidos:

- 3 em 64×64, origem `creative.thumbnail_url`.
- 1 em 160×284 e 1 em 160×285, origem `official_meta_connector.picture`.
- 8 em 1080×1920, 1 em 1080×1350 e 1 em 1080×1080, origem
  `object_story_spec.video_data.image_url`.
- 12 sem dimensões: 11 com origem `creative.thumbnail_url` e 1 com origem
  `object_story_spec.video_data.image_url`.

Portanto, há **5 vídeos com baixa resolução registrada**. Os 12 sem dimensões
não foram classificados como pequenos. Um deles possui 128.781 bytes no Storage,
o que também não permite deduzir sua dimensão. É necessária leitura dos bytes
com acesso autorizado ao objeto para fechar esse inventário.

Os 77 dinâmicos têm política `first_available_asset`: 60 `SHARE` e 17 `VIDEO`.
Seus objetos têm entre 1.308 e 9.987 bytes. Isso justifica auditoria, mas tamanho
de arquivo não comprova dimensão. Todos foram atualizados pela última vez em
24–25/09/2026. Não há carrossel classificado no inventário atual; isso não prova
ausência de múltiplas peças nos anúncios classificados como dinâmicos.

O bucket `dashboard-creatives` continua privado, limite de 10 MiB, MIME types
JPEG/PNG/WebP/GIF/AVIF. Foram encontrados os 144 objetos apontados pelas 144
linhas disponíveis; presença no catálogo de objetos não equivale a decodificação
ou validação autenticada do download.

## Como o sistema funciona e onde falha

### Identificação e representação

Em `supabase/functions/sync-meta-ads/meta-creative.ts:228`, o normalizador lê
`object_story_spec`, `asset_feed_spec` e os campos do creative. Classifica nesta
ordem: asset feed → dinâmico; child attachments → carrossel; dados de vídeo ou
`object_type=VIDEO` → vídeo; URL de imagem → imagem; restante → desconhecido.
Um `video_id` isolado não entra diretamente na expressão `hasVideo`.

Vídeo: resolve ID em `creative.video_id`, `video_data.video_id` ou primeiro vídeo
do asset feed. Imagem: tenta `creative.image_url`, `link_data.picture` e thumbnail.
Carrossel: representa a primeira peça com URL disponível. Dinâmico: primeira URL
disponível na sequência imagens/vídeos, depois imagem/thumbnail do creative.
Classificação prioriza dinâmico, mas a seleção de URL prioriza carrossel: num
payload com os dois, a política registrada pode não descrever a fonte escolhida.
O critério de representação não usa resultados de entrega por asset e não
identifica uma combinação vencedora de anúncio dinâmico.

### Fontes e seleção

O fetch de anúncios solicita `creative{id,name,object_type,thumbnail_url,image_url,
video_id,effective_object_story_id,object_story_spec,asset_feed_spec}`. Não resolve
hashes pelo endpoint `adimages`.

Para vídeos classificados estritamente como `video`, já existem consultas a:

1. `/{video_id}/thumbnails`: `height,width,uri,is_preferred`, com paginação.
2. `/{video_id}?fields=format,picture` como fallback.
3. `/act_{account}/advideos?fields=id,picture`, com limite de páginas.
4. Overrides recebidos pelo endpoint, identificados como fonte do conector.
5. `video_data.image_url`, `creative.image_url`, `creative.thumbnail_url`.

Em `firstDownloadedCandidate` (linha 846), para no primeiro fallback que baixa.
Em `resolveCreativePreview` (linha 864), compara somente esse primeiro fallback
com um candidato de vídeo previamente selecionado. Outros candidatos válidos
podem nunca ser baixados. As dimensões declaradas do `format` descrevem o formato
de vídeo e não garantem a dimensão real de sua imagem `picture`.
Uma thumbnail preferida acima do limiar pode excluir candidatas maiores antes
da comparação dos bytes. Erros de consulta das thumbnails são convertidos em
fallback/null e não conservam a causa específica para o diagnóstico.

Dinâmicos com vídeo ficam fora da lista `videoIds` (linha 1128). Além disso,
`canReuseCreativePreview` permite reutilizar indefinidamente previews não-vídeo
com o mesmo creative ID, mesmo após expirar o intervalo de consulta. Assim,
uma fonte dinâmica antiga pode nunca receber melhoria de arquivo.

### Validação, persistência e atualização

`downloadPreview` verifica HTTP, MIME informado e 10 MiB e calcula SHA-256.
`readImageDimensions` lê cabeçalhos PNG, GIF, JPEG e parte dos WebP; não cobre
AVIF nem WebP lossless. Pode aceitar bytes incompletos com cabeçalho suficiente;
não é uma validação completa de decodificação. Segue redirects sem uma
lista explícita de hosts permitidos e não limita a leitura progressivamente
quando falta Content-Length. São pontos a tratar dentro da seleção de mídia.

O caminho inclui cliente/conta/anúncio/creative e prefixo do hash. A linha tem
chave única `(client_id,source,account_id,entity_type,entity_id)`. O upload usa
`upsert:true`, seguido do upsert da linha e da exclusão do caminho anterior
(linha 1326). **Não há comparação com a resolução do arquivo armazenado antes
de substituir.** Sem URL/candidato, existe caminho de sucesso que pode gravar
preview nulo e remover o anterior. Exceções de API/download/upload normalmente
preservam o caminho anterior ao gravar apenas o erro; isso não cobre todos os
caminhos de preview ausente.

Ao reutilizar o mesmo arquivo, a linha recebe `metadata: args.creative.metadata`
(linha 465), construído novamente pelo normalizador. Dimensões, bytes e versão
da estratégia anteriores podem desaparecer. A perda da versão também pode
reativar downloads desnecessários em ciclos posteriores.

A seleção usa referências de anúncios do período, deduplicação, lotes de 25,
concorrência 4 e TTL de 20 horas. `videoRefreshOnly` força vídeos, sem reescrever
métricas, mas não seleciona somente os ruins e não inclui dinâmicos. `dryRun`
evita as escritas nesse módulo; não deve ser confundido com autorização para
executar o endpoint de produção, que também participa do controle de runs.

O módulo publicado foi relido: `sync-meta-ads` versão 15, atualizado em
25/09/2026, e contém os mesmos mecanismos críticos acima. A auditoria não
presume que a futura versão do #8 já esteja publicada.

## Fontes: confirmação prática e limites

Foram utilizadas exclusivamente respostas do conector oficial Meta e os URLs
HTTPS de CDN por ele retornados, sem editar parâmetros ou inventar URLs.
Arquivos de amostra foram lidos em memória e decodificados com Pillow;
nenhuma dessas imagens foi gravada no bucket ou no repositório.

### Vídeos com baixa resolução registrada

| Creative ID | Thumbnail atual: dimensão real / bytes | Vídeo pelo conector |
| --- | --- | --- |
| 2153789125098930 | 64×64 / 1.613 | ID não resolvido |
| 1894846637904718 | 64×64 / 1.554 | ID não resolvido |
| 2096610387765625 | 64×64 / 1.995 | ID não resolvido |
| 866753836293205 | 64×64 / 2.149 | ID não resolvido |
| 1335745578281759 | 64×64 / 1.716 | ID não resolvido |

Nos últimos dois, o arquivo já registrado tem 160×285/160×284. Atualizar a partir
da thumbnail atual seria pior. Não foi confirmada uma fonte superior para esses
cinco vídeos. IDs não resolvidos não identificam se a causa é permissão, mídia
removida, contexto da conta ou limitação do conector.

### Dinâmicos: alternativa melhor confirmada para a thumbnail atual

| Creative / video ID | `creative.thumbnail_url` real | `video.picture` real |
| --- | --- | --- |
| 1380678307194655 / 1632637051124343 | 64×64 / 1.739 bytes | 160×284 / 11.094 bytes |
| 2166006714197904 / 1981790575800271 | 64×64 / 1.480 bytes | 160×284 / 7.534 bytes |
| 848067684846149 / 789563380850233 | 64×64 / 1.616 bytes | 160×284 / 9.709 bytes |

Esses três casos comprovam que a imagem associada ao mesmo vídeo pode ser
melhor que a thumbnail do creative. Não são HD e não foram comparados com os
bytes do objeto já armazenado; só poderão substituí-lo após essa comparação.

### Imagens originais

Para os creatives `1391468559460359` e `2431696897272450`, `image_hash` resolveu
assets de **1080×1350 reais**, 308.997 e 231.316 bytes. Hashes:
`f111441a67d4581f0e056b71bab24b6f` e `c93e4d4c094c4f61f3f74fd3c5e9d46f`.
Isso confirma acesso atual a `adimages` para esses assets. Não demonstra que
os 40 previews de imagem precisam ser substituídos.

### Documentação primária

As páginas de referência Meta tentadas retornaram HTTP 429. O SDK oficial atual
confirma os contratos, sem provar acesso a cada mídia:

- [AdCreative: parâmetros GET thumbnail_width/thumbnail_height e campos](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py).
- [AdVideo: GET thumbnails, format, picture e source](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/advideo.py).
- [VideoThumbnail: uri, dimensões e is_preferred](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/videothumbnail.py).
- [AdImage: hash, url e dimensões originais](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adimage.py).

O conector disponível não expõe `object_story_spec`, `asset_feed_spec`, parâmetros
thumbnail_width/thumbnail_height, edge thumbnails ou `source` do vídeo. Assim,
esses acessos específicos ainda não foram testados com a credencial do coletor.
Não houve leitura de secrets para contornar essa limitação. Usar os mesmos
acessos do backend num ensaio somente de leitura será uma validação separada;
não é necessário nem autorizado trocar credenciais ou ampliar permissões.

FFmpeg fica como alternativa pontual somente se for obtido um arquivo de vídeo
do anúncio com acesso autorizado e um frame representativo aprovado. Não há
arquivo original confirmado nesta auditoria; não se propõe infraestrutura de vídeo.

## Interface e segurança existentes

`src/lib/creatives.ts` filtra Meta e frente antes de ordenar por leads, desempata
por ID e limita previews a nove. `CreativeRanking` mostra três, expandindo a nove.
Franquias/Condomínios e apresentação reutilizam `CreativeCard`. Card e modal usam
`naturalWidth/naturalHeight`, `object-fit: contain`, avisos e recuperação de URL.
Essas funcionalidades serão preservadas.

`creative-previews.ts` exige sessão, filtra cliente/source/entity, assina em lote
por 600 segundos e mantém cache de 5 minutos por membro/cliente/caminho. A
política real da tabela exige vínculo; a do Storage verifica o ID do cliente na
primeira pasta e o vínculo. Navegador não chama a Meta. Segurança por RLS foi
inspecionada, mas não foi realizada nova homologação autenticada de permissões.

A classificação visual de dinâmico com vídeo pode inferir vídeo pelo `video_id`
mesmo se a representação selecionada tiver sido uma imagem. Registrar o tipo
do asset efetivamente escolhido resolve essa ambiguidade sem mudar o layout.

Não foi executado Playwright nesta etapa e não se declara UI aprovada. Testes
existentes incluem fixtures e não validam a qualidade da mídia real. O teste
atual chamado de falha de Storage exercita apenas concorrência; será necessário
testar o fluxo real de enriquecimento com erro de upload injetado.

Logs de função nas últimas 24 horas não forneceram mensagens com `creative` ou
`error`; ausência desses termos não comprova ausência de falhas de preview.
Advisors foram consultados: não apontaram ausência de RLS nesta tabela/bucket.
Os avisos de senha vazada, source_accounts sem policy e índices existentes não
serão alterados nesta frente. Referências de contexto:
[proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
[RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Plano proposto — requer aprovação antes da implementação

1. **Concentrar a mudança no enriquecimento.** Extrair apenas auxiliares pequenos
   quando a testabilidade justificar. Preservar interface pública, guards do #8,
   coletores, ranking, métricas e layout. O trabalho pode ser desenvolvido na
   base atual; reconciliação final usará a main integrada, sem merge na main.
2. **Identificar a peça antes de comparar resolução.** Enumerar fontes do mesmo
   asset, por ID/hash. Em carrossel, manter representação estável da primeira
   peça; não trocar por outra só porque tem mais pixels. Em dinâmico, escolher
   um asset representativo determinístico com tipo/origem corretos, sem afirmar
   que foi a combinação entregue ou de maior desempenho. Consultar imagens por
   hashes e thumbnails dos vídeos dinâmicos quando disponíveis.
3. **Comparar candidatos reais.** Descobrir fontes com deduplicação e concorrência
   limitada; usar dimensão declarada só para priorizar consulta. Validar bytes,
   tipo, limites e dimensões reais; comparar resolução útil, lados e proporção,
   dando preferência semântica à capa configurada entre opções equivalentes.
   Usar somente hosts HTTPS autorizados retornados pela Meta e validar redirects.
   Sem upscale nem edição de query CDN. Avaliar thumbnail_width/height em leitura
   antes de habilitar essa fonte; suporte de SDK não será tratado como prova de HD.
4. **Proteger o arquivo anterior.** Para o mesmo creative/asset, comparar também
   com o arquivo existente; se dimensão faltar, medi-lo por acesso interno, sem
   presumir baixa qualidade. Resultado desconhecido/inferior/falha conserva o
   preview anterior. Se o creative mudou e não há mídia válida, registrar
   explicitamente a identidade do preview preservado para não atribuir mídia
   antiga ao novo creative silenciosamente. Remover a exclusão automática da
   versão anterior para permitir reversão. Não regravar objetos de hash igual.
5. **Registrar e selecionar sem custo recorrente desnecessário.** Preservar
   metadados de arquivo no reuso; usar versão da estratégia, origem, asset ID/hash,
   dimensões, bytes, hash, data, resultado e código seguro da última tentativa.
   Usar `metadata`/timestamps/last_error existentes. Definir lista explícita de
   IDs para simulação local e futura atualização em lotes, sem englobar métricas.
   Não criar endpoint público novo nem acionamento alternativo aos guards do #8.
6. **Testar o enriquecimento completo e a interface.** Cobrir 64×64 versus
   1080×1920; 160×284 versus maior; dimensão ausente; API/download/URL expirada/
   Storage; preservação com candidato ausente; dinâmico misto/vídeo/imagem/
   carrossel; hash igual; repetição idempotente; isolamento cliente/conta; falha
   ao persistir. Usar arquivos raster completos decodificáveis, inclusive inválidos,
   e contratos reais do módulo. Playwright desktop/mobile com top 3/top 9,
   duas frentes, modal, apresentação e assinatura renovada. Fixtures serão
   identificadas; qualidade externa continuará dependente de provas reais.
7. **Reconciliar e abrir PR separado.** Após a integração do #8, incorporar sua
   versão à branch exclusiva, revisar o diff final, preservar `authorizeCollection`
   e correções de tipos e repetir checks relevantes. Criar PR Draft com evidências,
   limitações, reversão e lista de autorizações. Se o #8 ainda não estiver integrado,
   declarar a reconciliação pendente em vez de simular conclusão.

Escolha proposta: helpers TypeScript no módulo existente e metadados JSONB,
pois atendem ao fluxo atual sem serviço novo. O trade-off é ampliar o cuidado
com validação dos formatos já aceitos pelo bucket; qualquer necessidade de codec
ou biblioteca adicional será justificada antes de introdução. Processamento
permanente de vídeo/FFmpeg, bucket público e reconstrução da UI foram descartados
por não resolverem a seleção com o menor escopo. Migration nova não é necessária
para a proposta; histórico ilimitado de tentativas não está incluído.

## Publicação futura e reversão — não executadas

Após código/testes aprovados e reconciliação com o #8:

1. Relatório somente de leitura com IDs, origem atual/candidata, dimensões, hashes
   e decisão por item. Priorizar cinco vídeos conhecidos, doze a medir e dinâmicos
   com asset de vídeo. Os dez vídeos de largura 1080 serão preservados se não
   houver melhora útil confirmada. Medir os 77 dinâmicos antes de decidir trocas.
2. Revisão de amostras reais e autorização nominal da lista de atualização.
3. Autorizações separadas para publicar função, integrar o PR (Pages pode publicar
   frontend ao integrar main) e executar gravações nos previews selecionados.
   Credenciais, cron, políticas e métricas não fazem parte dessas autorizações.
4. Atualização em lotes pequenos com novo caminho por hash, sem excluir anteriores;
   comparar resultados, clientes, contagem e falhas por item antes de ampliar.
5. Reversão de código por revert/deploy autorizado. Reversão de mídia restaura
   caminho/hash/metadados do manifesto anterior, com escrita autorizada separadamente.
   Reverter código sozinho não desfaz uma alteração de referência no banco.

Antes de qualquer escrita real será necessário salvar um manifesto privado dos
registros-alvo e confirmar os objetos anteriores. Não há snapshot privado ou
assinatura temporária versionado neste documento.
