# Recuperação restrita dos arquivos aprovados — 29/10/2026

> Estado mais recente: recuperação e reversão explícita homologadas no isolado.
> Veja o [gate final de produção](gate-final-producao-2026-10-29.md).

> Atualização posterior: o pacote foi publicado no isolado como Meta v10 e os
> dry runs passaram. O fluxo com escrita sintética e a restauração auditável
> continuam pendentes; veja [homologação remota e reversão](homologacao-remota-e-reversao-2026-10-29.md).

## Estado da entrega

Implementação local concluída; **homologação remota ainda pendente**. A revisão
automática rejeitou o deploy exclusivamente isolado por interpretar a instrução
"não fazer novo deploy" como abrangendo também homologação. Não se tentou
contornar a recusa por CLI ou outra ferramenta. Nenhuma versão remota mudou.

| Camada | Situação |
| --- | --- |
| Código publicado | Meta v18, coordenador v12, entrada v2; três migrations anteriores preservadas |
| Nova recuperação direta | Implementada e testada localmente; pacote exato preparado |
| Edge Runtime isolado da nova implementação | Não publicado/testado por bloqueio de aprovação automática |
| Imagens atualizadas nesta etapa | Zero |
| Reservas criadas nesta etapa | Zero |
| Merge PR #10 | Não realizado; permanece Draft |

## Implementação mínima

`approved-preview-source.ts` valida um manifesto privado com digest SHA-256
fixado por `approved-preview-manifest.ts`. Cada entrada contém cliente, fonte,
conta, anúncio, creative, vídeo, asset, SHA-256 aprovado, dimensões, MIME,
referência oficial e estado anterior completo para CAS/reversão. O manifesto
executável contém somente os sete anúncios comprovados abaixo.

O arquivo público no Git contém apenas pin/IDs; os dados privados são injetados
no módulo de configuração **dentro do pacote servidor** pelo script
`scripts/package-meta-approved-source.py`. Um checkout ou pacote sem esses dados
falha de forma fechada para os IDs fixados. O pacote privado não deve ser anexado
a PR público, log ou artefato público de CI.

Essa escolha preserva os tipos MIME do bucket privado, que aceita apenas imagens.
Uma tentativa de criar o manifesto JSON no bucket isolado retornou HTTP 400;
a leitura posterior também confirmou que o objeto não existia. Nenhum objeto
foi criado, e a configuração do bucket não foi alterada. A solução final não
requer upload de manifesto, novo bucket, secret, RLS, schema ou permissão.

No coletor, a exceção exige a aprovação da reserva, o snapshot anterior exato e
`sameIdentity`, além de `representationCertain=true`, creative/video/asset
coincidentes. Usa exclusivamente a referência do manifesto, `downloadPreview`
e os guards existentes de HTTPS, host, redirect, tamanho, MIME e imagem real.
Confere hash, dimensões e qualidade HD antes de reutilizar anti-downgrade,
Storage privado imutável e a escrita CAS existente. O digest do manifesto é
registrado nos metadados quando há substituição. URLs nunca entram no diagnóstico.

A coleção incompleta continua registrada como `collection_complete=false`.
Apenas uma referência validada dessa maneira recebe
`preview_approved_reference_valid` e pode prosseguir apesar da falha de enumeração.
O fluxo geral permanece bloqueado em coleção incompleta. Nenhum parâmetro novo
do navegador fornece pin, dados privados ou URL. Entrada, coordenador, autenticação,
reservas, fingerprint, guard compartilhado e recibos não foram modificados.

## Avaliação dos dez candidatos aprovados

Uma única chamada dry run à v18 publicada, com os dez IDs e hashes já aprovados,
retornou HTTP 207, sem escrita. Foi usada para verificar os guards atuais dos
dez anúncios, não para liberar atualizações. Os IDs coincidem com o manifesto.
A falha de coleção `meta_10` persiste; três representações dinâmicas também são
rejeitadas. Os dez GETs das referências oficiais recuperaram os hashes aprovados.
As dez linhas de previews foram lidas antes/depois e permaneceram idênticas.

| Anúncio | ID | Arquivo oficial | Identidade atual / execução preparada |
| --- | --- | --- | --- |
| AD3 — Mais do que uma franquia | 120251781898970114 | 1080×1920, Full HD | Comprovada; incluído |
| AD1 — INVESTIMENTO ALTAMENTE | 120251464998300114 | 720×1280, HD | Comprovada; incluído |
| AD2 — GANHAR DINHEIRO EM 2026 | 120251465059580114 | 1080×1920, Full HD | Comprovada; incluído |
| AD3 — ESSA É A HISTÓRIA | 120251465070010114 | 1080×1920, Full HD | Comprovada; incluído |
| AD01 — | 120233201881890114 | 1080×1920, Full HD | Comprovada; incluído |
| Novo anúncio de Engajamento | 120241847281150114 | 1080×1920, Full HD | Comprovada; incluído |
| Novo anúncio de Engajamento — Cópia | 120242286711110114 | 1072×1928, HD | Comprovada; incluído |
| CTV01 | 120246159821230114 | 720×1280, HD | Dinâmica ambígua; excluído |
| CTV02 | 120246161019030114 | 720×1280, HD | Dinâmica ambígua; excluído |
| CTV04 | 120246161118490114 | 720×1280, HD | Dinâmica ambígua; excluído |

Disponíveis e comprovados: **cinco Full HD e dois HD**. Três arquivos HD estão
disponíveis, mas a identidade continua bloqueada. Não há candidato com arquivo
indisponível nesta leitura. Esses números descrevem candidatos, não atualizações
persistidas. CTV 1 — Depoimento e os outros 33 registros não foram consultados
nem incluídos na operação.

## CTV01 e os outros dinâmicos

O novo dry run confirma `preview_approved_identity_mismatch` para CTV01,
CTV02 e CTV04. A leitura oficial completa é solicitada pelo coletor no campo
`creative{...,object_story_spec,asset_feed_spec}`; a v18 avalia o payload com o
token efetivo, mas não devolve o feed bruto. O conector disponível não expõe esses
campos, e não há sessão oficial confirmada ou cópia segura do token de produção.
Não se usou o token local diferente, nem se tentou extrair a credencial.

Não foi possível recuperar a composição completa para uma reconciliação
determinística. Portanto, o resultado operacional é **manter os três excluídos**.
Nenhuma chave foi preenchida artificialmente e nenhum `representationCertain`
foi forçado. A existência do vídeo e os hashes dos bytes não substituem essa prova.
As leituras administrativas necessárias continuam documentadas no relatório
de acesso/identidade, sem exigir concessões novas por tentativa.

## Validação

- Typecheck dirigido do coletor e helper: aprovado.
- Regressão backend: **247 testes aprovados**, incluindo os novos casos de
  manifesto/hash/bytes/MIME/dimensões, URI e redirect inseguros, snapshot,
  identidade, dinâmica ambígua, qualidade, anti-downgrade, CAS e replay.
- **Um teste adicional de integração de leitura** carregou o pacote privado
  exato, verificou o digest real do manifesto e utilizou `downloadPreview` real
  nos sete arquivos oficiais. MIME, dimensões e SHA-256 exatos: aprovado.
- Reservas, autenticação, recibos, idempotência e métricas normais também estão
  cobertos na regressão existente, sem mudanças nesses componentes.
- Os testes com escrita usam somente o harness em memória; nenhuma imagem foi
  atualizada no Supabase. Os downloads reais são GETs de leitura.
- A primeira execução ampla sofreu falha local do cache temporário do runner;
  a execução com diretório temporário dentro do workspace passou integralmente.

Os testes acima **não equivalem a homologação no Edge Runtime remoto**.
O pacote isolado está preparado com os mesmos fontes executáveis e adaptador
de teste já existente, fixture privada e erro Meta 10 controlado na enumeração.
O roteiro restante consiste em dry run válido, repetição somente leitura,
hash divergente, compatibilidade normal de métricas e comparação de linhas,
objetos e reservas antes/depois. Não há migration ou redeploy dos outros componentes.

## Pacotes e reconciliação do PR

A comparação de todos os arquivos das três funções publicadas confirmou
correspondência com a base `0d89c382`, normalizando apenas quebras de linha e
a omissão de declaração `.d.ts` usada no empacotamento já publicado. A main
remota continua `144534eb997662a5ba6a84dc7b353dbc4e99ad6a`.

Novo diff executável: `meta-creative.ts`, `approved-preview-source.ts` e
`approved-preview-manifest.ts`. Testes e script de empacotamento são separados.
Não há alterações em migrations, coordenador, entrada, Google Ads, GA4 ou frontend.

| Artefato privado local | SHA-256 |
| --- | --- |
| `production-package.private.json` (12 arquivos, ainda não homologado remotamente) | b9c6c4cccff4b69e858cbf3ee4c06f9d42d12680070f8f0983e0879f90b9465a |
| `isolated-package.private.json` (16 arquivos, pendente de autorização do deploy isolado) | 0bf1e7d9e58ad1c21cfcd4f7a188bba3c0722a43579efc2eaa71db331f8e8f30 |
| Manifesto privado de sete candidatos | 94ff6ed405876d5b77fec4ed71427772c6921f476847f7d7977700d93f28b6a1 |
| Pacote de rollback Meta v18, recuperado de produção | 02f934596aff8eba90b2da94e9975c3e70cae26b34773bf4db127b3b0ea86e25 |

Artefatos e recibos seguros: `artifacts/meta-direct-source-20261029/`.
Nenhum pacote privado ou referência assinada entra no Git. O script de build
confere o digest e os IDs antes de gerar o pacote e não possui operação de deploy.

## Piloto preparado, ainda não autorizado para execução

1. AD3 — Mais do que uma franquia: `120251781898970114`, Full HD.
2. AD1 — INVESTIMENTO ALTAMENTE: `120251464998300114`, HD.

Um novo pedido privado está preparado sem criar reserva. Exige chave nova após
autorização, usuário administrador e o fluxo legítimo existente. Antes de publicar
ou despachar, comparar novamente o snapshot CAS com o manifesto fixado: mudança
concorrente exige interromper e revisar a versão do manifesto, nunca rebater o
estado anterior automaticamente. Referência expirada ou bytes divergentes também
interrompem sem substituir fonte. Os cinco outros aptos só seguem depois de um
piloto autorizado e integralmente confirmado, incluindo inspeção visual real.

## Reversão

O pacote Meta v18 efetivamente publicado está preservado. Em regressão, parar
novos pedidos e restaurar esse pacote, se necessário, sem remover migrations
aditivas ou republicar coordenador/entrada. Os sete backups privados das imagens
anteriores foram lidos e tiveram hashes conferidos com o manifesto.

Uma eventual reversão de imagem deve conferir a versão nova realmente persistida,
obter nova exclusão legítima, validar o objeto anterior e restaurar referências
com CAS e evidência terminal adequada. Não reutilizar reservas, apagar objetos ou
executar UPDATE avulso fora do protocolo. Os antigos previews de baixa resolução
não podem ser enviados como atualização HD comum: anti-downgrade e o validador
terminal rejeitam essa simulação. A reversão operacional de imagens precisa ser
conferida/autorizada antes da futura escrita; não foi executada ou homologada aqui.

O bloqueio imediato para concluir esta entrega é a autorização específica do
deploy **somente isolado** e seus dry runs. Produção permanece sem publicação
nova e sem atualização de mídia.
