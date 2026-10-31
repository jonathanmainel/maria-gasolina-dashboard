# Recuperação seletiva de previews Meta — 30/10/2026

**Entrega parcial, sem publicação.** A correção visual está no [PR #20](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/20). Este trabalho propõe o coletor em branch separada `codex/meta-preview-hd-recovery`, a partir da `main` `baae2747195ffd33bdb65a56ca42e801fa455a9c`, preservando o PR #10. A homologação hospedada do novo coletor e a descoberta oficial de todos os 12 casos ainda estão pendentes. Não houve escrita, deploy, migration ou merge em produção.

## Diagnóstico observado

- Produção: `sync-meta-ads` v19, hash do bundle `ed4492b765d2cef533a26668c7adf94dfd54d92cec66ca47ae318c12a2a3a0dd`.
- Inventário lido: 27 vídeos, dos quais 12 com preview 64×64, todos com origem persistida `creative.thumbnail_url`. Os arquivos atuais dos 12 foram baixados e decodificados: todos são efetivamente 64×64 e correspondem ao hash persistido.
- Nove são de campanhas de Franquias/Condomínios; três são de engajamento. A classificação comercial não foi alterada.
- Os dois recibos seletivos existentes abrangem somente os quatro anúncios já publicados. Nenhum dos 12 consta de suas seleções; nenhum possui `preview_last_attempt`. `refreshed_at` não foi tratado como evidência de tentativa de upgrade.
- A consulta atual do conector Meta confirmou os Creative IDs e Video IDs dos 12. A consulta de vídeos retornou lista vazia e os 12 em `unresolved_video_ids`. Isso comprova a limitação dessa consulta, não a inexistência do vídeo ou de uma fonte HD.
- O conector não expõe o endpoint de thumbnails nem os parâmetros de tamanho do Creative. A alternativa foi o Graph API Explorer autenticado. A sessão expirou após a primeira consulta e a conexão de controle do navegador ficou indisponível durante a renovação. Não foram copiados tokens nem solicitados novos escopos.
- O `meta_10` conhecido no fluxo anterior não foi atribuído aos 12 sem nova consulta. O relatório JSON registra `current_meta_10_observed: null`. A autorização do token usado no Explorer não comprova a autorização do token de produção.

## Resultado por anúncio

Todas as linhas continuam **64×64 em produção**. “Candidato” significa arquivo medido localmente; não significa atualização publicada nem autorização de substituição. IDs completos, hashes e identidade `video:<id>` estão em [per-ad-report.json](per-ad-report.json).

| Anúncio | Grupo | Candidato medido | Fonte | Resultado / impedimento concreto |
| --- | --- | --- | --- | --- |
| `120252454201950114` · Entre uma reunião | Condomínios | **720×1280 HD** | Graph `/2363040967835865/thumbnails`, consulta atual | Novo caso fora do manifesto antigo. 11 itens sem próxima página; três arquivos medidos, um 640×1136 insuficiente e dois HD com o mesmo hash. Faltam medir os oito restantes e consultar `format.native`; Full HD não foi comprovado. |
| `120252454414370114` · Final de semana | Condomínios | Pendente | Atual: `creative.thumbnail_url` | Vídeo `1055125747390694` não resolvido pelo conector; consulta oficial de thumbnails/format pendente da retomada da sessão. |
| `120251464707830114` · Já pensou | Franquias | Pendente | Atual: `creative.thumbnail_url` | Vídeo `3527806400713534` não resolvido; mesma pendência de consulta oficial. |
| `120252454450800114` · Próximo pit stop | Condomínios | Pendente | Atual: `creative.thumbnail_url` | Vídeo `2260101164888643` não resolvido; mesma pendência. |
| `120251464728120114` · Essa história | Franquias | Pendente | Atual: `creative.thumbnail_url` | Vídeo `2010361932935561` não resolvido; mesma pendência. |
| `120252454489610114` · Imagina | Condomínios | Pendente | Atual: `creative.thumbnail_url` | Vídeo `2115243459097778` não resolvido; mesma pendência. |
| `120251464738740114` · Depoimento franqueado | Franquias | Pendente | Atual: `creative.thumbnail_url` | Vídeo `2092319958309317` não resolvido; mesma pendência. |
| `120252454512730114` · Perrengue | Condomínios | Pendente | Atual: `creative.thumbnail_url` | Vídeo `1599811341590577` não resolvido; mesma pendência. |
| `120252454525840114` · Melhor mini mercado | Condomínios | Pendente | Atual: `creative.thumbnail_url` | Vídeo `933335529397804` não resolvido; mesma pendência. |
| `120233201881890114` · AD01 | Engajamento | **1080×1920 Full HD** | Thumbnail oficial do corpus de 28/10, bytes locais e referência CDN revalidados | Native histórico 1080×1920. IDs atuais conferem; falta nova consulta de formato/identidade na execução e homologação seletiva. Não foi atualizado antes por estar fora do lote executado. |
| `120241847281150114` · Novo anúncio | Engajamento | **1080×1920 Full HD** | Mesmo corpus, bytes locais e referência CDN revalidados | Native histórico 4320×7680. Mesmas pendências; a variante de vídeo 360×640 observada anteriormente não foi confundida com a resolução nativa. |
| `120242286711110114` · Cópia | Engajamento | **1072×1928**, piso de pixels HD | Mesmo corpus, bytes locais e referência CDN revalidados | Native histórico **480×864**. O JPEG excede o native registrado. Substituição não preparada como fonte nativa HD: requer comprovar outra representação oficial HD, sem inferir qualidade apenas pelos pixels. |

O arquivo novo HD tem SHA-256 `cfa3d1e201b4ddc8d13cc4c5d18bd44c80407ab04ecc744176a66731ae6ad867`, MIME JPEG e 154.211 bytes. A API declarou 1080×1920, mas a decodificação integral mostrou **720×1280**. HTTP 200 e dimensões declaradas não foram considerados sucesso Full HD.

Os oito casos ainda sem candidato não foram classificados como irrecuperáveis. Seu bloqueio atual é a falta da consulta oficial autenticada, não uma negativa definitiva da Meta.

## Implementação proposta e motivo

O fluxo genérico de thumbnails já aceita IDs fora do manifesto. A lacuna era a recuperação quando a coleção falhava e a reversão dos anúncios não fixados no manifesto. A solução mantém a autorização por conteúdo exato, sem criar uma permissão genérica por URL:

1. O planejador local identifica todos os vídeos, prioriza os abaixo de HD, valida IDs e prepara consultas oficiais limitadas. Não usa uma lista fixa de anúncios, credenciais ou rede; não concede aprovação nem dispara sincronização.
2. A operação seletiva existente reconsulta anúncio/Creative e representação, lê o vídeo e sua coleção paginada de thumbnails e mede os arquivos. O hash aprovado continua obrigatório.
3. Se a coleção estiver incompleta ou não fornecer o hash aprovado, tenta `AdCreative.api_get` com `thumbnail_width`/`thumbnail_height`. Esses parâmetros estão no [SDK oficial da Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py). A chamada só ocorre com seleção explícita, identidade exata e dimensões nativas oficiais de pelo menos HD.
4. O tamanho solicitado respeita o native, preserva sua proporção e prioriza piso Full HD. A resposta precisa confirmar conta, Creative e um único Video ID. Representações ambíguas são rejeitadas. A URL deve pertencer à CDN oficial; arquivo, MIME, dimensões, proporção, limites e hash são verificados. O fallback rejeita arquivo maior que o native comprovado.
5. A prova independente do Creative pode autorizar o arquivo exato apesar da falha na coleção. O recibo mantém `collection_complete:false` e os erros observados; não mascara a consulta incompleta como completa.
6. Reservas, autenticação, snapshots, CAS, arquivos imutáveis e recibos existentes permanecem. Para novos anúncios, a reversão exige recibo terminal da atualização exata e o objeto anterior preservado, com nova seleção/snapshot/hash. Não aceita uma URL arbitrária ou histórico de outra conta/anúncio.

O cron normal mantém seu comportamento. Não foram adicionadas varredura automática em massa, extração de frames ou download de vídeos nas Edge Functions. As métricas continuam independentes do resultado dos previews. O manifesto privado histórico e seu hash permanecem intactos.

## Operação reproduzível, sem publicação

```powershell
python scripts/plan-meta-preview-recovery.py --inventory inventory.json --output discovery-plan.json
python scripts/audit-meta-preview-hd.py --cases discovery-plan.cases.json --evidence graph-evidence.private.json --output audit-output
```

O primeiro comando produziu **27 elegíveis / 12 prioritários** no inventário atual. `discovery-plan.cases.json` é a lista de identidades, sem aprovação. O segundo reaproveita o auditor existente, com três downloads concorrentes, limites de bytes/candidatos, validação da CDN e decodificação integral; exportações devem vir de sessão autorizada e nunca conter tokens/cookies. O cache evita baixar novamente um arquivo já medido com a mesma identidade de URL e transformação.

O operador deve registrar a paginação, os códigos reais por endpoint e `format.native`, medir candidatos e revisar a representação antes de aprovar hashes. O plano local inclui todos os 27; não equivale a disparar os 27. O limite existente de 50 anúncios por reserva não foi alterado. A reserva e o coletor fazem novamente a verificação de identidade e CAS antes de persistir.

Foi preparado localmente um **rascunho não disparado** de seleção com hashes dos dois candidatos históricos compatíveis com o native e do novo candidato HD. O terceiro histórico, com divergência de native, foi excluído dessa proposta. O rascunho usa marcador de UUID inválido intencionalmente, depende de concluir as verificações pendentes e não concede autorização de produção. Mídias, URLs CDN, pacotes com referências privadas e rascunho ficam somente nos artefatos ignorados pelo Git.

## Validação e limites

| Verificação | Resultado |
| --- | --- |
| Suíte do backend, incluindo leitura opcional dos sete arquivos oficiais | **283 testes**, 17 arquivos; ver registro final da execução |
| Auditor local existente | **15 testes aprovados** |
| Planejador reutilizável | **4 testes aprovados** |
| TypeScript dos módulos alterados | Aprovado |
| Pacote de revisão com manifesto original | 14 módulos, pin original validado; nenhuma publicação |
| Pacotes isolados | Gerados com os novos módulos; nenhuma publicação |
| Protocolo SQL real no projeto isolado `uwafdxsdsgqysjjxfywo` | **30 asserts aprovados**, transação integralmente revertida |
| Recuperação em mais de um anúncio fora do manifesto | Dois IDs sintéticos aprovados no coletor real com transportes em memória; **um** novo anúncio real com arquivo oficial HD medido |
| Rejeições | Identidade/conta/vídeo incorretos, representações ambíguas, native não comprovado, bytes pequenos, hash incorreto, CAS, origem de reversão ausente/estrangeira/corrompida |
| Persistência/reversão do novo coletor | Aprovadas no harness em memória com arquivos anteriores preservados; **ciclo hospedado Auth→fila→coletor→Storage→recibo ainda não executado** |

O teste SQL real verifica reservas/claims/seleção/CAS e compatibilidade da coleta normal, mas sua transação é revertida e não executa o novo coletor hospedado. Ele não substitui o ciclo completo. A configuração privada `HOMOLOG_AUTH_FILE` do administrador sintético não estava disponível nesta sessão. Nenhum teste foi viabilizado contornando autenticação, fabricando reservas ou manipulando cooldown.

Os quatro previews publicados mantiveram seus hashes/dimensões no inventário de produção. O teste opcional leu novamente as sete referências oficiais do pacote e verificou bytes/hash/MIME/dimensões, incluindo os quatro publicados. Isso valida a disponibilidade dos arquivos e a compatibilidade do protocolo; não equivale a uma nova inspeção visual autenticada da produção.

| Publicado anteriormente | Dimensões preservadas | SHA-256 |
| --- | --- | --- |
| `120251781898970114` | 1080×1920 | `a1079185835e4788f58a424fb12f1003aa0f4d532a830a16b46a3ca3a19eb2cf` |
| `120251464998300114` | 720×1280 | `19ca2c2b38962ca8d775a48411c7d3fb698ad57073d70d5b7979aac0d28bded4` |
| `120251465059580114` | 1080×1920 | `e9776a96caf34bd99f7c398615376fcadc63688e8c1ac2557ab89d9d32e546ff` |
| `120251465070010114` | 1080×1920 | `c075b267bf4fa1e0b127593e04b03e50e4c6ad596cb47ad9d7ea77eb0330525e` |

## Pendências para concluir a homologação

1. Retomar a sessão autorizada do Explorer, concluir thumbnails/format dos 12 e medir os oito candidatos restantes do primeiro caso. Registrar os erros concretos por anúncio, sem presumir `meta_10`.
2. Confirmar as permissões e a acessibilidade dos mesmos endpoints no contexto do token servidor, sem expor o segredo nem ampliar escopos automaticamente. A consulta de Creative parametrizado está testada com provedores controlados; ainda falta prova desse fallback na Meta real.
3. Executar o novo coletor no ambiente isolado com administrador sintético existente: upgrade e reversão de dois anúncios fora do manifesto, autenticação normal, fila, bytes persistidos, CAS, idempotência, recibos e arquivos anteriores. Ainda depende da configuração privada de autenticação de homologação.
4. Atualizar este relatório com a evidência obtida. Somente então submeter pacote e seleção concretos para autorização específica de produção. Não há autorização implícita de merge, migration, deploy ou escrita produtiva.

## Arquivos alterados nesta branch

- `supabase/functions/sync-meta-ads/meta-creative.ts`
- `supabase/functions/sync-meta-ads/official-creative-thumbnail.ts` e testes
- `supabase/functions/sync-meta-ads/receipt-preview-source.ts`
- `supabase/functions/sync-meta-ads/approved-preview-source.ts` (tipo de proveniência)
- `supabase/functions/sync-meta-ads/preview-quality.test.ts`
- `scripts/plan-meta-preview-recovery.py` e `tests/test_meta_preview_recovery_plan.py`
- `scripts/package-meta-approved-source.py`
- `tests/homolog/package.mjs`
- Este relatório e JSON por anúncio

Sem mudanças em migrations, Storage/RLS, cron, integração de métricas, índices comerciais, Google Ads ou GA4.
