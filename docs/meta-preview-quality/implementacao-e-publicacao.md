# Seleção de previews Meta — implementação local

> Registro da primeira versão. Para o piso HD, coleção completa, apresentação
> 9:16 e cobertura atual, consultar [padronização HD](padronizacao-hd-e-cobertura-2026-10-28.md).

Implementação aprovada em 28/10/2026, branch `codex/meta-creative-preview-quality`,
worktree exclusiva `work/meta-creative-preview-quality`. Produção não foi alterada.

## Resultado

A branch inclui a main integrada do PR #8, merge
`37f3d785f0a1d6a41830252babbba113609df39f`. O wrapper de autenticação secret,
`authorizeCollection` e a reserva do coletor foram preservados. Os outros
coletores, cron, Auth, RLS, credenciais, schema e interface não foram alterados.
O diff em `index.ts` acrescenta a seleção opcional de anúncios e faz esse modo
pular tanto consultas de insights como gravações de métricas.

- Compara os bytes e dimensões de fontes da mesma peça, em vez de parar no
  primeiro download. Resolve `image_hash` em `adimages`; consulta thumbnails,
  formatos e picture do vídeo, incluindo o vídeo representativo dos dinâmicos.
- Mantém a primeira peça de carrossel. Em dinâmicos, conserva o asset conhecido
  por ID/hash, mesmo se a ordem do feed mudar. Legado misto sem identificação
  suficiente é preservado com `preview_identity_uncertain`, sem trocar de peça.
- Compara com dimensões registradas do arquivo existente; na ausência delas,
  lê o objeto privado, verifica o hash e mede o arquivo. Falha de medição não é
  tratada como resolução zero. Hash igual permite confirmar dimensões sem essa
  leitura adicional.
- Só substitui quando ambos os lados úteis não pioram e a proporção é compatível.
  Uma thumbnail quadrada pode dar lugar à imagem retangular do mesmo vídeo se
  ambos os lados melhorarem. Não há redimensionamento, recorte ou upscale.
- Conserva preview anterior em falha de API, candidato ausente, download inválido,
  URL expirada, Storage, banco, identidade incerta ou resolução inferior.
- Upload imutável com hash e `upsert:false`; nenhum arquivo anterior é removido.
  Repetição de hash não reenvia arquivo; objeto deixado por uma falha no banco
  pode ser reutilizado após conferir os bytes. A atualização usa `updated_at`
  como compare-and-set para rejeitar resultado de inspeção concorrente antiga.
- Preserva metadados anteriores quando campos chegam omitidos/null. Registra
  origem, tipo do asset, identidade, dimensões, hash, bytes e última tentativa.
  `preview_previous` conserva a referência imediatamente anterior; não há
  histórico recursivo ilimitado dentro do JSON.

## Controle de escopo e custo

**Atualizar arquivos existentes exige modo seletivo explícito.** Coleta normal,
inclusive cron e botão do PR #8, reutiliza os arquivos disponíveis do mesmo
creative. Publicar o código sozinho não dispara recuperação em massa do legado.
Novos anúncios sem preview podem receber o melhor candidato como parte da
coleta já existente; isso também exige autorização de publicação futura.

No endpoint Meta já protegido, `preview_ad_ids` aceita 1–50 IDs numéricos, sem
ampliar o acesso a clientes/contas. Uma lista vazia/inválida é rejeitada. Seleção
explícita consulta os previews históricos diretamente, sem exigir atividade
recente no período de métricas. Sem a lista, o modo anterior
`refresh_video_previews_only` continua disponível e inclui dinâmicos com vídeo.
Quando os dois campos são usados, vale a interseção da seleção com tipos de vídeo.

`dry_run:true` não grava tabela, Storage ou diagnósticos de run. Para escrita,
`automation_run_id` válido e reserva aceita continuam obrigatórios. O endpoint
JWT do botão não ganhou parâmetros livres de preview nem acesso a coletores
internos. O despacho de um lote será preparado no backend autorizado com run
exclusivo e protocolo existente; não se deve disputar ou reutilizar um run
despachado pelo botão/cron nem forjar uma reserva.

Limites: concorrência 4, lotes Graph de 25 anúncios/hashes, até 3 páginas de
thumbnails/biblioteca de vídeos, 5 páginas de anúncios, 8 downloads candidatos
por peça, 10 MiB por imagem, 40 milhões de pixels, timeout por requisição e até
3 redirects HTTPS entre CDNs Meta permitidos. Hints de tamanho priorizam a
descoberta limitada; a decisão final usa dimensões dos bytes. Candidatos omitidos
pelo limite são registrados. IDs e URLs iguais são deduplicados na descoberta
e na lista de candidatos da peça. O fallback de biblioteca não varre a conta
quando o nó do vídeo já forneceu candidatos.

## Evidência real e antes/depois controlado

As leituras reais e a decodificação de amostras da Meta estão na
[auditoria de 28/10](auditoria-e-plano-2026-10-28.md). A implementação não criou
novas fontes de mídia nem demonstrou permissões adicionais.

| Cenário | Comportamento anterior | Comportamento local corrigido |
| --- | --- | --- |
| Fallback 64×64 antes de candidato 1080×1920 | Podia parar no primeiro arquivo válido | Compara os dois; seleciona 1080×1920 quando mesma peça |
| Armazenado 160×284, candidato 1080×1920 | Sem guard global contra downgrade | Confirma melhoria e conserva referência/objeto anterior |
| Armazenado 1080×1920, candidato 160×284 | Podia substituir em refresh forçado | Conserva 1080×1920 |
| Dimensões anteriores ausentes | Não havia comparação com o arquivo anterior | Mede objeto e verifica hash; preserva se não puder medir |
| Candidato ausente ou falha | Caminho sem candidato podia limpar referência | Mantém arquivo, referência e metadados e registra resultado |
| Feed dinâmico misto | Primeiro asset disponível sem identidade persistida | Não troca um asset conhecido por outro; legado ambíguo fica preservado |
| Repetição após falha de banco | Podia reenviar/sobrescrever arquivo | Verifica objeto imutável existente e tenta persistir a referência |

**Quantidade potencialmente recuperável confirmada na amostra: 3 dinâmicos**
com `video.picture` de 160×284 versus thumbnail atual de 64×64. Isso compara
fontes atuais da Meta, não prova que os três objetos armazenados sejam inferiores.
A quantidade efetiva de substituições permanece pendente da comparação privada
por item. Esses três não se somam aos 27 classificados como vídeo: pertencem
ao grupo de 77 dinâmicos, dos quais 17 têm `object_type=VIDEO` no inventário.

Nos cinco vídeos de baixa resolução registrada, nenhuma fonte superior foi
confirmada; devem permanecer com os arquivos existentes. Doze vídeos não têm
dimensões registradas e precisam ser medidos. Dois assets estáticos foram
confirmados em 1080×1350, sem demonstrar necessidade de substituir seus previews.
Não há base para prometer recuperação dos 77 dinâmicos ou dos 40 estáticos.

## Verificações

| Verificação local | Resultado |
| --- | --- |
| Frontend integrado do #8 | 603 testes, 53 arquivos |
| Backend integrado com esta correção | 151 testes, 13 arquivos, incluindo 41 novos casos |
| Endpoint seletivo | 5 casos: validação, reserva ausente/incorreta, dry run e escrita reservada |
| Playwright Chrome | 6 cenários: Franquias e Condomínios, desktop/mobile, top 3/9, modal, tipos, URL renovada e apresentação |
| Tipos frontend e módulos de mídia | Aprovados |
| Build Pages | Aprovado, sem publicação |
| Empacotamento Sites | 4 testes aprovados após gerar seu pacote específico |
| Capturas locais | Apresentação desktop/mobile conferida visualmente; proporção, rótulos, dimensões e limites dos modais também verificados nas asserções |

Testes de integração exercitam o módulo e o handler reais com transportes de
Auth/Graph/Storage/banco controlados. **Não são homologação de Supabase Auth,
RLS, Storage ou Graph em produção.** Os rasters são completos e produzidos pelo
gerador de fixtures versionado; não representam anúncios de cliente. Nenhum
serviço de processamento ou biblioteca de runtime foi adicionado.

A primeira rodada mobile teve um timeout antes do carregamento dos cards sob
contenção; passou isoladamente sem alterar código/asserções e os seis passaram
juntos na rodada final. As fixtures foram completadas para responder ao status
de sincronização do #8. Um teste de empacotamento inicialmente foi executado
após build Pages, que não gera `dist/server`; após gerar o pacote Sites, os
quatro passaram. Não houve correção do produto para mascarar esses resultados.

Comandos de reprodução, dentro da worktree exclusiva:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd test -- --maxWorkers 1 --pool threads
node node_modules/vitest/vitest.mjs run --config supabase/functions/sync-vitest.config.ts --pool threads --maxWorkers 1
npm.cmd run typecheck
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck --strict --lib es2022,dom supabase/functions/sync-meta-ads/meta-creative.ts supabase/functions/sync-meta-ads/preview-media.ts
node node_modules/@playwright/test/cli.js test --config playwright.meta-previews.config.ts
npm.cmd run build:pages
node scripts/prepare-sites-build.mjs
npm.cmd run test:sites
```

No Windows deste ambiente, frontend/browser precisaram executar fora do sandbox
restrito para iniciar e avançar. As permissões concedidas foram para execução
local; a fixture bloqueia conexões externas e não chama coletores reais.

## Limitações

- As páginas Meta tentadas retornaram 429; os contratos adicionais foram conferidos
  no SDK oficial. `thumbnail_width/height`, `source` original do vídeo e extração
  FFmpeg não foram habilitados com base apenas nessa documentação.
- A validação de runtime verifica container, assinatura, integridade estrutural e
  dimensões codificadas. Não é um codec completo que decodifique cada pixel de
  JPEG/GIF/WebP. PNG inclui verificação dos CRCs. A UI também depende do decoder
  do navegador. Formatos não inspecionáveis são rejeitados conservadoramente.
- AVIF e WebP animado não são selecionados nesta versão; arquivos existentes
  desses tipos permanecem intactos. Não se alterou a lista do bucket.
- Empates de dimensão ou mudanças de proporção não comprovadas não autorizam
  substituição. Arquivos sem identidade ou dimensão verificável podem permanecer
  pequenos mesmo havendo outra imagem maior no anúncio.
- Não foi executado Deno/Edge Runtime real nesta frente; tipos e integração de
  transporte foram conferidos localmente. Recomenda-se homologação da função
  empacotada em ambiente isolado antes de autorizar deploy em produção.
- Arquivos anteriores e eventuais uploads órfãos ficam conservados. Limpeza futura
  exige política e autorização separadas; não há rotina nova de exclusão.

## Atualização futura e autorizações

1. Autorizar homologação em Supabase isolado, se desejado; publicar nele o pacote
   completo de `sync-meta-ads`, incluindo `preview-media.ts`, e conferir Storage,
   reserva, CAS e falhas reais. Isso não foi feito nesta aprovação local.
2. Preparar manifesto privado dos registros-alvo: cliente/conta/ad/creative/asset,
   caminho, MIME, hash, metadados e timestamp. Confirmar leitura dos objetos.
3. Executar somente leitura/dry run de uma lista explícita, inicialmente os três
   dinâmicos com fonte candidata confirmada. Medir o armazenado e produzir decisão
   por anúncio: melhorar, hash igual, inferior, ambíguo ou indisponível. Expandir
   investigação aos doze vídeos sem dimensão e demais dinâmicos sem prometer troca.
4. Solicitar autorização específica para **deploy do pacote**, **merge do PR**
   (aciona Pages), **reserva/despacho do lote** e **escrita de previews/metadados**
   dos IDs aprovados. Não aproveitar autorização de sincronização de métricas.
   Não é necessária migration, ampliação de permissões ou alteração de cron.
5. Aplicar lote pequeno, conferir bytes/qualidade, caminhos, hashes e métricas
   preservadas; renovar assinaturas pela interface existente. Só ampliar com
   resultado revisado e autorização correspondente. Não excluir objetos antigos.

**Reversão:** código por revert/deploy autorizado da versão anterior que já inclui
o #8. Mídia por restauração das referências e metadados do manifesto privado,
com compare-and-set e autorização de escrita separada. `preview_previous` facilita
localizar a versão imediata; não substitui o manifesto. Reverter código sozinho
não desfaz referências alteradas no banco. Não remover guards, desfazer #8 ou
reutilizar uma reserva já concluída para fazer rollback.
