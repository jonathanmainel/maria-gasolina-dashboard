# Protocolo reservado de previews — homologação isolada

> Fechamento em 29/10: protocolo homologado no projeto isolado, frontend publicado
> pelo PR #19 e pacotes de produção preparados. Resultados, IDs de execução e gate
> final em [publicação simplificada](publicacao-simplificada-2026-10-29.md).

28/10/2026. Escopo aprovado: extensão mínima do protocolo existente, PR #10
Draft, branch `codex/meta-creative-preview-quality`. Produção **não alterada**.
Este relatório substitui o bloqueio de implementação registrado anteriormente.
Não libera publicação ou os dez previews reais: essa decisão pertence à próxima
autorização. A pesquisa dos outros 33 continua separada.

## Contrato e limites

A mesma entrada autenticada `request-dashboard-sync` aceita:

```json
{
  "action": "request",
  "client_slug": "maria-gasolina",
  "sources": ["meta_ads"],
  "operation": "previews",
  "request_key": "UUID NOVO POR OPERAÇÃO",
  "preview_ad_ids": ["ID NUMÉRICO DO ANÚNCIO"],
  "preview_assets": [
    {
      "ad_id": "ID DO ANÚNCIO",
      "creative_id": "ID DO CREATIVE",
      "video_id": "ID DO VÍDEO",
      "sha256": "HASH DO ARQUIVO APROVADO"
    }
  ]
}
```

Os valores ilustrativos acima devem ser substituídos por IDs/hashes válidos.
Sem sessão verificada, HTTP 401. Somente admin vigente do cliente ativo pode
reservar. O cliente numérico, a conta e a identidade anterior vêm do banco;
o navegador não declara usuário, papel, conta, URLs ou privilégios.
São aceitos 1–50 IDs numéricos distintos, de **uma conta ativa e habilitada por
lote**, fonte exclusivamente Meta. IDs desconhecidos, ambíguos ou de outra
conta/cliente são rejeitados. Lotes entre contas devem ser separados.

`preview_assets` é opcional para a seleção geral, mas deve conter a lista
completa dos hashes revisados nos lotes reais previamente aprovados. O servidor
valida creative/vídeo contra os registros próprios e vincula o hash aprovado
à seleção imutável. Não é um mecanismo para fornecer URLs ou outra peça.
O corpo tem limite de 32 KiB para comportar cinquenta identidades/hashes.
O pedido publicado de métricas conserva seu formato; `metrics` é o padrão.

## Migrations restritas

1. `20261028181122_meta_preview_reservation_protocol.sql`: acrescenta somente
   `operation`, `preview_selection`, `selection_fingerprint`, `preview_results`
   à tabela de reservas. Padrão `metrics`, sem remover reservas históricas.
   Restringe imutabilidade e cria RPCs internas de reserva/início/verificação.
   Mantém assinaturas antigas e suas implementações de métricas, protegidas por
   wrappers compatíveis. Os aliases legados continuam exclusivos do backend.
2. `20261028185400_meta_preview_receipt_validation.sql`: reforça a prova terminal
   por arquivo, piso HD, identidade e referência de reversão. Não altera schema,
   RLS ou grants.
3. `20261028185700_meta_preview_status_compatibility.sql`: uma operação de mídia
   concluída não avança `last_success_at` nem substitui o histórico de métricas.
   Uma operação ativa conserva o estado ocupado; consultas explícitas por run
   também informam sua finalidade. Sem mudanças na interface.

As três foram aplicadas **somente em `uwafdxsdsgqysjjxfywo`**. A separação
registra as correções encontradas durante a revisão/homologação, em vez de
reescrever uma migration já aplicada. Nenhuma modifica cron, coordenador de
Google/GA4, RLS ou credenciais de produção. Todos os RPCs de controle permanecem
`SECURITY INVOKER`, search path vazio, execute somente postgres/service_role.

## Reserva, despacho e confirmação

`request_dashboard_preview_sync` usa a exclusão consultiva por cliente/fonte já
existente. Conserva cooldown de cinco minutos, chave idempotente e bloqueio para
queued/running/indeterminate. Ordena IDs/assets e calcula SHA-256 canônico do JSON
persistido, incluindo conta na reserva e, por anúncio, creative, vídeo/asset,
hash/caminho e versão anterior (`updated_at`). O conteúdo não pode ser trocado
após reservar. A mesma chave com outro propósito/seleção é rejeitada.

O despacho continua sendo `private.dispatch_dashboard_sync` → pg_net →
`sync-dashboard-daily` → `sync-meta-ads`. O coordenador lê o payload reservado,
não parâmetros livres do chamador. O start mantém a reivindicação única e
revalida admin/cliente/conta. `authorizeCollection` exige correspondência exata
com a reserva. O início de previews revalida a fotografia anterior de cada
registro. Uma reserva não pode iniciar coleta duas vezes, atravessar clientes
ou trocar de finalidade. O enriquecimento também compara a fotografia antes
do processamento e conserva o CAS no momento de persistir.

O coletor retorna recibos por anúncio após reler os registros persistidos:

| Resultado | Significado |
| --- | --- |
| `updated` | Nova referência persistida; objeto privado imutável e identidade confirmados |
| `preserved_adequate` | Arquivo existente HD/superior conservado |
| `preserved_inadequate` | Fonte insuficiente; anterior conservado e pendência de qualidade mantida |
| `failed_download` | Download, validação, fonte/identidade ou coleção não confirmados |
| `failed_storage` | Falha de Storage ou impossibilidade de verificar o objeto anterior |
| `failed_database` | Persistência no banco rejeitada |
| `cas_conflict` | Versão anterior divergente ou CAS rejeitado |
| operação `indeterminate` | Timeout/resposta incompleta/recibo inconsistente; exclusão mantida |

`verify_dashboard_preview_results` exige uma ocorrência terminal para **todos**
os IDs exatos e confronta caminhos, hashes, MIME, dimensões, creative/vídeo/asset,
objeto privado, piso HD e referência anterior. O coordenador só usa as contagens
confirmadas pelo banco. HTTP 200 isolado não vale como prova. Falhas e CAS deixam
o lote failed; divergência/ausência de prova deixa indeterminate. Um lote que
apenas preserva por insuficiência pode concluir tecnicamente, mas cada anúncio
continua explicitamente pendente, sem ser promovido a preview aprovado.

Não se usam campos de resultado para autorizar. Recibos confirmados tornam-se
imutáveis. Não há endpoint alternativo, reserva forjada, cron novo, coletor
Google/GA4 modificado ou atualização seletiva automática na coleta de métricas.
Frames continuam sendo fallback local explícito; o endpoint não inicia FFmpeg.

## Evidências e andamento

Os arquivos privados ficam em `artifacts/meta-preview-protocol-20261028/` e
`artifacts/meta-preview-publicacao-20261028/`, ambos ignorados pelo Git.
Credenciais/sessões não foram registradas nesses relatórios. As credenciais de
teste preexistentes foram lidas em memória; secrets de produção não foram copiados.

Auth, RLS, banco, pg_net, reserva, Edge Runtime e Storage são reais no projeto
isolado. Apenas respostas dos provedores e os PNGs são sintéticos. Isso comprova
o protocolo e persistência; não é nova evidência de acesso à Meta ou validação
visual de anúncios reais. Os onze arquivos reais já recuperados continuam
validados separadamente, sem reabrir a pesquisa de mídia.

Foram criados dez previews sintéticos e bucket privado no ambiente isolado.
Para testar permissões, foi reproduzida ali a política de leitura por membro
**já versionada** em `20260924141803_fix_creative_storage_rls.sql`, sem ampliar
acesso anônimo ou escrita pelo navegador. Arquivos `tests/homolog/preview-*.sql`
são suporte **exclusivo do sandbox**, não migrations de produção. O reconciliador
de testes já existente foi estendido para exigir término real e recibo de mídia
verificado antes de liberar um timeout; ele não será transportado para produção.

O fechamento das suítes, versões, runs e comparações está no relatório de
[29/10](publicacao-simplificada-2026-10-29.md). Estado atual: **homologado no
projeto isolado; frontend publicado; backend não publicado em produção**.

## Reversão e futura publicação — não executar nesta autorização

A reversão conservadora é operacional e aditiva: interromper novos pedidos de
previews restaurando a entrada anterior, esperar a confirmação terminal dos
trabalhos e restaurar coordenador/coletor a partir dos pacotes preservados.
Conservar colunas, recibos, reservas e objetos antigos; não aplicar um down que
apague histórico. As assinaturas/padrão de métricas permanecem compatíveis.
Uma limpeza estrutural futura exige plano e autorização próprios.

Reverter código não restaura referências de mídia. O manifesto privado deve
guardar a linha anterior completa, identidade, caminhos, hashes, MIME, dimensões,
metadados e `updated_at`, além do estado novo confirmado. Uma reversão de mídia
precisa autorização adequada, exclusão e CAS sobre hash/caminho/versão atuais,
validação do objeto antigo e restauração atômica da referência/metadados. Não
excluir objetos nem contornar o anti-downgrade no coletor automático. Nenhuma
reversão de mídia de produção foi necessária ou executada nesta etapa.

Sequência futura, condicionada à aprovação da homologação e **nova autorização**:

1. Atualizar a base, conferir diff/CI, registrar commit main, versões e pacotes
   atualmente publicados e o manifesto privado. Confirmar ausência de execuções
   conflitantes. Revalidar os dez candidatos e cada objeto atual por leitura;
   excluir ambiguidade, indisponibilidade, igualdade ou downgrade. Preservar CTV 1.
2. Aplicar as três migrations aditivas na ordem indicada e verificar ACLs/defaults.
   Não aplicar SQL de suporte de homologação. Não mudar secrets/RLS/cron.
3. Publicar **pacotes de produção**, sem adapter/fixtures: coletor Meta primeiro,
   coordenador depois, entrada autenticada por último. Assim a entrada não aceita
   previews antes de todo o caminho estar pronto. Conferir hashes da origem que
   foi homologada e responder sem iniciar mídia como smoke test.
4. Reconciliar main novamente, integrar #10 somente após os checks, acompanhar
   Actions/Pages e validar a interface publicada autenticada. Não disparar
   sincronizações extras de métricas como teste de mídia.
5. Preparar dry run e manifesto final, separados por conta. Solicitar pela entrada
   autenticada o piloto de **dois anúncios**, IDs e hashes aprovados, chave nova.
   O servidor cria a reserva e o coordenador despacha; não chamar o coletor
   diretamente nem aproveitar uma reserva de métricas.
6. Confirmar os dois recibos terminais, objetos, hashes/MIME/dimensões nativas,
   referências anteriores, invariância das métricas e imagens reais no dashboard
   publicado, com URLs assinadas renovadas, desktop/mobile/modal/apresentação.
   Só então continuar lotes pequenos sequenciais, respeitando cooldown/exclusão.
7. Diante de falha, conflito, timeout ou dúvida, parar novos lotes e consultar
   estado remoto antes de qualquer ação. Não repetir automaticamente uma execução
   aceita. Timeout continua retendo exclusão até término comprovado e reconciliação
   operacional autorizada; o helper de sandbox não é uma solução de produção.

Os outros 33 registros não entram nesses lotes nem bloqueiam a primeira entrega.
Continuam precisando de classificação/manifesto e autorização independentes.
