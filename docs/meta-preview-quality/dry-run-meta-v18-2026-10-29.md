# Redeploy exclusivo Meta e dry run de produção — 29/10/2026

## Publicação autorizada

Somente `sync-meta-ads` foi publicada em `hlqrpreqvvxtkruwsolg`: v17 → v18.
Commit executável: `0d89c382d3d3cd3cf53e94ef51b55335e0d7cc0f`.
SHA-256 do pacote JSON conferido antes do deploy:
`9f4ca618dbc40d1ecb0fec43abb8378ea27a5afce889a2c87a08d7262bda5869`.

Os dez arquivos do pacote foram comparados ao commit autorizado; após o deploy,
os dez fontes recuperados da função publicada correspondem ao pacote, com
normalização apenas de quebras de linha e prefixo de caminho do empacotamento.
Único fonte executável alterado frente à v17: `meta-creative.ts`.
Configuração `verify_jwt=false` preservada, assim como a autenticação interna.
SHA do bundle ezbr retornado pela plataforma para v18:
`58aa2fcec5a89fb5334aa7a374e2ce9d46692b682bff41d96f3c4131ad69b413`.
Este hash do bundle tem formato distinto do hash do pacote JSON autorizado.

O pacote completo da v17 lido de produção foi preservado privadamente antes do
deploy para rollback. Coordenador v12, entrada manual v2, Google Ads v8, GA4 v10
e import-network v5 mantiveram versões e hashes dos bundles anteriores.
Nenhuma migration, alteração de secret, RLS ou cron foi executada.

## Uma chamada remota, somente leitura

Executada uma única chamada ao caminho homologado do coletor, com
`dry_run=true`, os dois IDs explícitos e seus hashes aprovados, sem reserva,
sem despacho pelo coordenador e sem override de mídia. Nenhuma repetição.

Resposta HTTP **207**, `ok=false`, `mode=dry_run`,
`database_write_performed=false`, Graph API **v26.0**.
Dois anúncios inspecionados, dois rejeitados, zero previews baixados, zero
inserções/atualizações realizadas ou propostas. O `status=success` do envelope
de enriquecimento apenas informa que o processamento terminou; não aprova os
previews. O agregado `video_thumbnail_candidates` foi zero.

| Evidência | AD3 — Mais do que uma franquia | CTV01 |
| --- | --- | --- |
| Anúncio | 120251781898970114 | 120246159821230114 |
| Creative esperado e atual | 1071980245374661 | 1380678307194655 |
| Vídeo esperado e atual | 1095304406487964 | 1632637051124343 |
| Resolução aprovada | 1080×1920 | 720×1280 |
| `candidate_count` (referências, incluindo fallbacks) | 1 | 2 |
| Arquivos efetivamente baixados e medidos | 0 | 0 |
| Coleção oficial integral | Não | Não |
| `lookup_errors` | `meta_10`, `meta_thumbnail_collection_incomplete` | `meta_10`, `meta_thumbnail_collection_incomplete` |
| Resultado | `approved_hash_rejected` | `approved_hash_rejected` |
| Código final | `preview_approved_collection_incomplete` | `preview_approved_identity_mismatch` |
| Hash aprovado encontrado | Não avaliado: sem bytes medidos | Não avaliado: sem bytes medidos |

Hashes exigidos nesta chamada:

- AD3: `a1079185835e4788f58a424fb12f1003aa0f4d532a830a16b46a3ca3a19eb2cf`.
- CTV01: `b2345046f591ddf84b82e404b7fc51807e00b6f841a4016bd7b75d9a3ca2c076`.

Não há dimensões ou hashes de novos arquivos a relatar: nenhum foi medido.
`bytes_hash_differences=0` não prova igualdade; nenhuma comparação ocorreu.
As referências contadas não representam thumbnails oficiais recuperadas.

## Causa observada e limites

Em ambos, `fetchVideoCandidates` registra `meta_10` e
`meta_thumbnail_collection_incomplete` ao falhar a consulta Graph
`/{video_id}/thumbnails` (campos `height,width,uri,is_preferred`, limite 50).
Logo, o bloqueio observado está na obtenção da coleção, antes de procurar o
hash aprovado. O código 10 é classificado como permissão/acesso pelo
[SDK oficial da Meta](https://github.com/facebook/facebook-php-business-sdk/blob/main/src/FacebookAds/Http/Exception/RequestException.php#L173-L175).
O diagnóstico seguro não expõe HTTP/subcódigo/mensagem bruta dessa resposta
Graph; não identifica a autorização específica que falta. Erros adicionais
podem ser deduplicados. Não há evidência para afirmar token inválido/expirado
ou mídia removida. O HTTP 207 acima é do coletor, não o status HTTP da Meta.

CTV01 também falha no guard da representação. Os IDs coincidem com os
aprovados; a linha atual é `dynamic`, sem vínculo legado `preview_asset_key`.
Na expressão `sameIdentity`, IDs iguais e chave anterior ausente deixam a
incerteza `representationCertain=false` como razão da rejeição. Isso significa
que o coletor não comprovou qual representação dinâmica corresponde ao preview
antigo; não comprova troca do creative ou vídeo. O payload seguro não permite
determinar qual ramo de normalização dinâmica produziu essa incerteza.
O código de identidade tem precedência sobre coleção incompleta, mas ambos os
bloqueios estão presentes em CTV01. Nenhum guard foi relaxado.

Os mesmos arquivos haviam sido recuperados por fontes oficiais no diagnóstico
anterior, com hashes exatos, conforme o relatório vinculado. Esta execução não
repetiu esses downloads externos nem comprovou nova recuperação pelo coletor.
A falha atual não permite concluir ausência dos hashes na coleção completa.

## Integridade antes e depois

Snapshots de contagem e conteúdo completos foram confrontados:

| Conjunto | Antes e depois | Resultado |
| --- | --- | --- |
| Reservas | 153 linhas; zero ativas; hash `8ebb14918d6aab1b5826db5da9ccb4af` | Idêntico: zero novas |
| Registros de previews | 145 linhas; hash `1398c4a488f6b5b1cbcd6980b254e668` | Idêntico: zero gravações |
| Objetos Storage | 144 objetos; hash `e121b38643206215b6831d6d77d12c58` | Idêntico: zero uploads |
| 14 tabelas protegidas de métricas/CRM/rede | Contagens e hashes de conteúdo | Todos idênticos |
| Migrations e cron | Snapshot das definições/registro | Idêntico |
| Outras Edge Functions | Versões e hashes de bundle | Idêntico |

Os dois objetos antigos também foram lidos e medidos antes/depois, sem mudança:

- AD3: 64×64, SHA-256 `aca46588e07262dfc3b278c6bde1ea2e4c4d4fdd0023d14a556b9d560ed0b404`.
- CTV01: 64×64, SHA-256 `0be242d3fa7eed0e812078428e36285ce7f31f083aabcd18d718cc7310136483`.

O site publicado carregou o portal de login normalmente no navegador interno.
O Chrome autenticado estava indisponível; o navegador acessível não tinha
sessão. Portanto, a verificação visual interna do dashboard não foi concluída.
Nenhuma regressão foi observada nas verificações disponíveis; não se declara
uma inspeção autenticada que não ocorreu. Frontend não foi alterado.

## Resultado e próximo passo mínimo

**Piloto ainda bloqueado.** Nenhuma reserva, gravação real, lote dos oito ou
investigação dos outros 33 foi executada. PR #10 permanece sem merge.
Não houve regressão constatada que exigisse rollback para v17.

Para avançar, o menor próximo diagnóstico é conferir a autorização da credencial
atual para a consulta de thumbnails destes dois vídeos e obter, de forma segura,
o HTTP/subcódigo e a mensagem sanitizada, se necessários para identificar a
permissão exata. Isso evita alterar secrets ou enfraquecer o protocolo sem causa
comprovada. CTV01 exige também esclarecer o vínculo da representação dinâmica
legada, preservando a validação de identidade. Não foi implementada alternativa,
modificação adicional ou nova tentativa nesta execução.

Evidências locais privadas: `artifacts/meta-preview-hash-fix-20261029/production-dryrun/`.
Incluem backup v17, retorno do deploy, snapshots antes/depois, resposta segura
do dry run e verificação dos objetos anteriores. Tokens e URLs assinadas
completas não foram incluídos neste relatório ou no resultado seguro.
