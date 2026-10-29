# Acesso Meta, identidade dinâmica e referências oficiais — 29/10/2026

## Resultado desta etapa

Somente leituras. Nenhum deploy, migration, alteração de secret/permissão,
reserva, despacho, upload, atualização de linha ou merge foi executado.
Não houve novo dry run do coletor, auditoria visual nem consulta aos outros 33.
O código de produção permanece na v18.

Os dois arquivos oficiais foram recuperados novamente, em memória, a partir
das referências já conhecidas. Ambos retornaram HTTP 200, SHA-256 e dimensões
exatos. Isso comprova disponibilidade dos bytes, mas não libera a identidade
dinâmica nem demonstra permissões da credencial do coletor.

| Anúncio | Creative / vídeo | Resposta CDN | Bytes / dimensões | SHA-256 |
| --- | --- | --- | --- | --- |
| AD3 — Mais do que uma franquia, 120251781898970114 | 1071980245374661 / 1095304406487964 | 200 | 386950 / 1080×1920 | a1079185835e4788f58a424fb12f1003aa0f4d532a830a16b46a3ca3a19eb2cf |
| CTV01, 120246159821230114 | 1380678307194655 / 1632637051124343 | 200 | 167180 / 720×1280 | b2345046f591ddf84b82e404b7fc51807e00b6f841a4016bd7b75d9a3ca2c076 |

Os arquivos correspondentes do corpus local também tiveram seus hashes
conferidos. Nenhum arquivo local foi usado para escrever em produção. Os GETs
CDN não enviaram Authorization nem cookies e não salvaram novos bytes de mídia.
Uma tentativa inicial no ambiente restrito falhou no transporte, sem resposta
HTTP; os GETs com acesso de rede autorizado foram os que produziram os 200.
Não houve repetição motivada por falha do provedor nem seleção de outra fonte.

## 1. O que está comprovado sobre meta_10

No último dry run da v18, ambos retornaram `meta_10` e
`meta_thumbnail_collection_incomplete` na obtenção de `/{video_id}/thumbnails`.
Isso continua sendo a evidência disponível da credencial de produção. O
[SDK oficial Meta](https://github.com/facebook/facebook-php-business-sdk/blob/main/src/FacebookAds/Http/Exception/RequestException.php#L157-L175)
trata o código 10 no âmbito de autorização/permissão; o tipo/subcódigo também
influencia a classificação. O código isolado não identifica a concessão ausente.

O coletor usa `Deno.env.get('META_ACCESS_TOKEN')`. A conferência atual dos
digests comprovou que a única cópia Meta local encontrada difere do secret
de produção; `META_API_VERSION` coincide. O token local diferente não foi usado
em nenhuma chamada Graph ou em conclusões sobre permissões de produção.
O usuário confirmou não ter uma cópia segura ou sessão oficial correspondente
disponível e orientou a não tentar extrair a credencial. Essa investigação parou
nesse limite. Nenhum valor ou digest da credencial foi registrado no relatório.

| Verificação da credencial do coletor | Situação |
| --- | --- |
| Origem da credencial | Secret `META_ACCESS_TOKEN` da Edge Function |
| Tipo: pessoa, Página, system user ou app | Não comprovado; o nome do secret não identifica o tipo |
| App, principal e permissões efetivamente concedidas | Não acessíveis pelas ferramentas disponíveis |
| Escopos granulares e associação ao ativo | Não comprovados |
| Tarefas do principal na Página proprietária | Não comprovadas |
| HTTP/subcódigo/fbtrace_id da falha Graph | Não retidos no diagnóstico da v18; não recuperados nesta etapa |
| Autorização específica ausente | Ainda não identificada |

`graphJson` conserva somente `meta_<code>` e descarta HTTP, subcódigo, mensagem
e trace. Portanto, não se registrou `subcode=null` como se a Meta o tivesse
omitido: o valor está indisponível. Também não se atribuiu expiração, remoção,
permissão específica ou mudança de versão da API sem evidência.

## 2. Identidades e limites do contexto oficial disponível

O MCP Meta leu novamente somente os dois creatives e os dois vídeos. Os
creatives retornaram os IDs aprovados e os posts:

- AD3: `102116115446914_1095304406487964`.
- CTV01: `102116115446914_1298957265775013`.

Ambos apontam para a Página do anúncio `102116115446914` e a conta publicitária
`1063721474298569`. Esse vínculo não comprova que a Página é proprietária do
vídeo, nem exclui crosspost. Para isso faltam `video.from`/identidade de origem
e a associação de negócio, lidos em contexto autorizado.

No MCP, CTV01 foi resolvido como `ready`; AD3 foi retornado como ID não
resolvido, sem código Graph detalhado. Isso não comprova remoção do vídeo.
O MCP não expõe o token, seu tipo, permissões, tarefas da Página nem os campos
`asset_feed_spec`/`object_story_spec` neste conector. Seu contexto não pode ser
equiparado ao secret de produção.

A evidência histórica das coleções foi recuperada em 28/10 usando Graph v23.0:
19 thumbnails para CTV01 e 10 para AD3, sem paginação pendente naquele registro.
O coletor atual usa v26.0. Não há evidência suficiente para atribuir a falha à
versão. Os downloads de hoje usam somente as referências CDN oficiais daquele
registro, sem credencial Graph. Logo, o sucesso do download não comprova que
outro token Graph tem permissões superiores ao do coletor.

## 3. Por que CTV01 está bloqueado

A leitura atual da linha de produção comprova:

- `creative_type=dynamic`, `preview_kind=dynamic_representative`.
- `has_asset_feed_spec=true` nos metadados persistidos em 25/09.
- `video_id=1632637051124343`, origem legada `creative.video_id`.
- `representative_policy=first_available_asset`, `preview_source=null`.
- `preview_asset_key` e `preview_for_creative_id` ausentes.
- Preview antigo privado ainda com SHA-256
  `0be242d3fa7eed0e812078428e36285ce7f31f083aabcd18d718cc7310136483`.

Os metadados legados não persistiram a lista de assets, labels/regras do feed ou
o vínculo do arquivo antigo a um asset específico. `has_asset_feed_spec=true`
não demonstra quantos vídeos/imagens existiam e não é o payload atual da Meta.

Em `normalizeMetaCreative`, uma peça dinâmica sem chave anterior só é considerada
comprovada no ramo do feed quando há um único vídeo, nenhuma imagem e o vídeo
coincide com o persistido. Outros ramos dinâmicos com preview legado exigem
chave anterior; feed omitido para uma linha anteriormente dinâmica também força
`representationCertain=false`.

No dry run v18, IDs coincidentes + chave anterior ausente + `sameIdentity=false`
demonstram que a rejeição vem de `representationCertain=false`, não da comparação
dos IDs. A proteção é intencional. Falta o payload completo que permita separar:
feed omitido, feed textual sem lista explícita de mídia, múltiplos assets,
carrossel ou outro ramo conservador. Não se escolheu uma dessas hipóteses como
causa específica sem o payload.

O código já aceita o caso comprovado de um único vídeo e nenhuma imagem.
Se a leitura oficial completa confirmar esse caso, pode não ser necessário
alterar a normalização: primeiro deve-se explicar por que a prova não chegou ao
coletor. Se houver outro caso determinístico documentável, uma reconciliação
restrita pode usar o manifesto aprovado + payload oficial completo + snapshot
legado, sem trocar o asset escolhido. Múltiplos assets sem vínculo determinístico
continuam bloqueados. Não preencher a chave com UPDATE avulso, não convertê-la
globalmente em true e não aceitar somente creative/video IDs coincidentes.

## 4. Menor alternativa para obter os bytes: referência oficial aprovada

É tecnicamente viável evitar enumerar a coleção para localizar bytes já
aprovados. Os GETs desta etapa comprovam a obtenção dos arquivos exatos. **A v18
não aceita isso automaticamente**: a coleção incompleta impede o resolver e a
aceitação final. Injetar uma URL em `video_picture_overrides` não resolve esse
bloqueio, não comprova a representação dinâmica e não vincula a URL à reserva.

Proposta para avaliação e aprovação futura, ainda não implementada:

1. Manter um manifesto privado e imutável de referências oficiais, limitado aos
   dois anúncios. Cada entrada vincula cliente, fonte, conta, anúncio, creative,
   vídeo, asset determinístico, SHA-256, dimensões, referência oficial e evidência
   de origem. A versão/digest exato do manifesto deve ser fixado na publicação;
   não se confia em um objeto que possa ser trocado silenciosamente.
2. O coletor consulta esse manifesto por igualdade completa da tupla e pelo hash
   já presente em `preview_selection.approved_assets`. O cliente não fornece URL
   arbitrária. Não se amplia o formato da seleção nem se altera sua fingerprint.
   Uma possível localização é um novo objeto de manifesto no Storage privado já
   existente, lido pelo coletor e validado contra o digest fixado. Sua criação
   também dependeria da autorização futura; não foi realizada nesta etapa.
3. Buscar exclusivamente a referência oficial correspondente, utilizando os
   guards de HTTPS/host/redirect/tamanho já existentes. Decodificar o arquivo,
   medir dimensões/proporção e exigir SHA-256 exato e qualidade mínima HD. URL
   expirada, bytes diferentes, identidade incerta ou manifesto divergente encerram
   o pedido preservando o preview atual; nenhum fallback para outro arquivo.
4. A seleção explícita por hash não precisa provar que não existe candidato de
   qualidade maior na coleção: outro candidato jamais substituiria o aprovado.
   Contudo, ainda exige a prova independente da identidade/representação atual.
   CTV01 permanece bloqueado enquanto essa prova faltar.
5. Reutilizar integralmente entrada autenticada → reserva imutável → coordenador
   → guard do coletor → exclusão/snapshot/CAS → objeto privado imutável → recibo
   terminal. A chave do asset seria persistida apenas junto à atualização CAS
   legítima, após comprovação, nunca como preparação fora do protocolo.
6. Manter anti-downgrade e verificação do arquivo antigo, idempotência, preservação
   dos objetos anteriores e reversão com manifesto/exclusão/CAS. Nenhuma escrita
   de métricas e nenhum endpoint de upload ou executor paralelo.

Isso requer uma regra explícita de comprovação da fonte aprovada no coletor,
em lugar da exigência de enumeração completa **apenas nesse modo restrito**.
`collection_complete=false` deve continuar verdadeiro no diagnóstico; não se
mascara a falha da API como coleção completa. A regra normal continua fechada
em erro de coleção. Se "todos os guards inalterados" incluir literalmente a
condição de coleção completa, essa alternativa não é possível: será necessário
corrigir o acesso à coleção. Nenhuma exceção foi implementada ou autorizada aqui.

## 5. Comparação e recomendação

| Aspecto | Corrigir acesso à coleção | Referência oficial exata aprovada |
| --- | --- | --- |
| Obtém os bytes hoje | Coletor bloqueado por meta_10 | Comprovado por GET, hashes exatos |
| Inspeção da credencial | Necessária para identificar a concessão exata | Não necessária para baixar os bytes |
| Alteração de permissões/secrets | Só se a causa confirmada exigir; não autorizada agora | Não necessária para o download |
| Regra de coleção | Permanece integralmente igual | Exige regra restrita e explícita de prova de fonte |
| Identidade CTV01 | Continua exigindo feed/representação comprovados | Mesma exigência; o hash não a substitui |
| Risco principal | Concessão excessiva ou ajuste da credencial sem diagnóstico | Expiração da referência ou associação incorreta no manifesto |
| Alcance | Pode atender futuras descobertas de mídia | Somente tuplas/hashes previamente aprovados |

Para estes dois arquivos, a referência oficial é o caminho de obtenção com
menor dependência de novas permissões. Recomenda-se preparar essa opção somente
depois de obter a prova dinâmica do CTV01 e aprovar explicitamente a regra
restrita de fonte. Não se recomenda trocar token, ampliar permissões, fazer
upload do corpus ou relaxar `sameIdentity` por tentativa.

## 6. Arquivos e testes mínimos de uma eventual implementação

Escopo previsto, sujeito à evidência do CTV01:

- `supabase/functions/sync-meta-ads/meta-creative.ts`: integração da fonte exata
  e, somente se demonstrado necessário, reconciliação dinâmica restrita.
- `supabase/functions/sync-meta-ads/approved-preview-source.ts` (novo helper
  pequeno): validação do manifesto e vínculo da referência à aprovação.
- `supabase/functions/sync-meta-ads/preview-quality.test.ts`: casos positivos e
  negativos. Teste específico do helper pode ficar nesse mesmo arquivo.
- Documentação e novo pacote exclusivamente Meta; manifesto privado versionado
  separadamente, sem URLs assinadas em Git ou logs.

Não se prevê migration, alteração de Auth, guard compartilhado, coordenador,
entrada, recibo ou frontend. `preview-media.ts` já fornece os guards de download
e dimensões, portanto não se prevê reimplementá-los. Nenhum desses arquivos
executáveis foi modificado nesta etapa.

Testes futuros mínimos: tupla e digest do manifesto; fonte exata com coleção
inacessível; hash diferente; URI expirada; host/redirect indevido; arquivo inválido,
abaixo de HD ou proporção divergente; ausência de aprovação; feed único comprovado
versus feed omitido/misto/múltiplo; snapshot/creative/video/asset divergentes;
anti-downgrade; exclusão/duplicação/CAS; recibo após persistência; métricas normais
sem dependência do manifesto. Reaproveitar os testes e o harness homologados.
Depois, homologação dirigida no Edge Runtime isolado, sem repetir a auditoria.

Executado agora: **67/67 testes existentes de preview-quality aprovados**, incluindo
hash obrigatório, proteção contra downgrade e representação dinâmica ambígua.
Esses testes não validam uma alternativa que ainda não foi implementada.

## 7. Leituras que um administrador deve executar em ambiente seguro

Sem alterar ou exportar o token e sem colá-lo em chat/logs:

1. Com a mesma credencial usada pelo coletor, inspecionar o token no mecanismo
   oficial Meta de debug: tipo, app, validade, permissões e granular_scopes/target_ids.
   Usar o contexto de app autorizado exigido pelo debugger; não criar concessões
   novas para realizar a inspeção. Registrar apenas metadados seguros.
2. Na Graph v26.0, comparar GET dos dois vídeos, campos `id,from,post_id,
   is_crosspost_video,universal_video_id`, e GET de cada `/{video_id}/thumbnails`,
   campos `height,width,uri,is_preferred`. Registrar HTTP, etapa, code,
   error_subcode, tipo, mensagem sanitizada e fbtrace_id (ou ausência real).
   Não exportar os URIs. Erro de leitura não deve virar declaração de inexistência.
3. Conferir a Página/conta de origem retornada e as tarefas/atribuições do
   principal sobre esse ativo no negócio, usando apenas leituras já permitidas.
   Não basta constatar acesso à conta de anúncios ou à Página do post.
4. Ler especificamente o creative CTV01 `1380678307194655`, com `id,account_id,
   video_id,effective_object_story_id,object_story_spec,asset_feed_spec`. Registrar
   presença versus omissão do feed, todos os IDs de vídeo/imagem, labels/regras,
   cards e vínculos do post; substituir URLs por identificadores opacos. O campo
   existe no [SDK oficial](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py#L27-L34),
   mas não é exposto pelo conector disponível neste diagnóstico.
5. Entregar somente os resultados sanitizados e o vínculo/prova determinística.
   Se o acesso continuar insuficiente, apontar a concessão solicitada pela Meta
   e a associação ausente com a respectiva evidência, sem alterar permissões.

## Condições para retomar o piloto

Hoje, disponibilidade dos dois arquivos está comprovada; autorização específica
ausente e representação dinâmica completa ainda não. O piloto exige: prova da
representação CTV01, decisão sobre acesso normal ou fonte restrita, implementação
aprovada se necessária, testes/homologação dirigidos e novo dry run sem escrita.
Depois, nova decisão para gravações reais. Nenhuma das duas falhas foi contornada.

Evidências seguras locais: `artifacts/meta-access-identity-20261029/`:
`credential-preflight.json`, `approved-ref-recovery.json` e
`guard-regression.json`. Os resultados Meta dos dois creatives/vídeos e a leitura
das duas linhas foram obtidos pelos conectores durante esta etapa. Os arquivos
de mídia e as referências anteriores permanecem privados e preservados.
