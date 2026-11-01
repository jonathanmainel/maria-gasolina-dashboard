# Homologação final de previews — 01/11/2026

Produção permanece na main `baae2747195ffd33bdb65a56ca42e801fa455a9c`, coletor v19. PRs #20 e #21 continuam sem merge/publicação. Os 12 previews de produção continuam 64×64. Este documento prepara o gate; não declara os arquivos publicados.

## Fontes reais

Graph Explorer v23.0: 12 identidades Ad/conta/Creative/vídeo conferidas, representações VIDEO únicas, 12 formatos nativos e coleções completas, **134 candidatos decodificados**, sem próxima página. Os oito candidatos restantes de “Entre uma reunião” foram incluídos; existem arquivos reais 1080×1920. Dimensões declaradas não foram usadas como prova dos pixels. Hashes, MIME, dimensões e resultados individuais estão no JSON por anúncio. A inspeção visual local conferiu os candidatos escolhidos.

| Anúncio | Produção | Native oficial | Melhor candidato medido | Decisão |
|---|---|---|---|---|
| 120233201881890114 · AD01 - | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120252454201950114 · AD1 - ENTRE UMA REUNIÃƒO | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120252454414370114 · AD2 - FINAL DE SEMANA | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120251464707830114 · AD3 - JÃ¡ Pensou | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120252454450800114 · AD3 - PROXIMO PIT STOP | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120251464728120114 · AD4 - Essa Historia | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120252454489610114 · AD4 - IMAGINA | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120251464738740114 · AD5 - DEPOIMENTO FRANQUEADO | 64×64 | 720×1280 | 720×1280 | Elegível |
| 120252454512730114 · AD5 - PERRENGUE | 64×64 | 720×1280 | 720×1280 | Elegível |
| 120252454525840114 · AD6 - MELHOR MINI MERCADO | 64×64 | 1080×1920 | 1080×1920 | Elegível |
| 120241847281150114 · Novo anÃºncio de Engajamento | 64×64 | 4320×7680 | 1080×1920 | Elegível |
| 120242286711110114 · Novo anÃºncio de Engajamento â€” CÃ³pia | 64×64 | 480×864 | 1072×1928 | Excede native; preservar anterior |

Os três anúncios de engajamento mantêm sua classificação não comercial. Dois têm fonte elegível; a Cópia continua bloqueada individualmente porque o JPEG de 1072×1928 supera o native 480×864. Nenhum upscaling ou arquivo de outro anúncio foi usado.

## Token servidor e alternativa operacional

Dry runs autenticados da função v19, sem reservas ou escritas, confirmaram `meta_10` nos nove anúncios comerciais fora do manifesto original. As identidades lidas pelo servidor correspondem às conferidas no Explorer. Não atribuímos esses erros aos três anúncios de engajamento sem diagnóstico equivalente. O token local encontrado não corresponde ao digest do secret de produção e não foi utilizado como prova de acesso servidor.

A consulta parametrizada de Creative permanece disponível quando o servidor comprova native HD. Ela não foi comprovada com o token servidor, e o bloqueio não foi mascarado. A alternativa usa o protocolo privado já existente: `prepare-meta-preview-approved-batch.py` gera configuração de fontes a partir de identidade oficial, paginação completa, native, arquivo decodificado e snapshot anterior. Não há IDs fixos no algoritmo, URLs aceitas por requisição ou permissão automática de disparo. O operador continua aprovando o hash exato por lote. O limite da configuração passa de 10 a 50, alinhado à reserva existente; permanecem os limites de bytes.

O lote atual preserva as sete entradas históricas e acrescenta nove identidades, totalizando 16 fontes. Onze atualizações são propostas. Enquanto o acesso direto da Meta permanecer restrito, novas fontes exigem conferência oficial e novo pacote de configuração. Isso é uma alternativa oficial operada, não uma comprovação de descoberta automática no servidor.

## Lacuna corrigida na homologação real

A primeira restauração gravou corretamente os objetos, mas ficou indeterminada: o verificador SQL ainda exigia o hash de um manifesto para uma origem por recibo. A migration `20261101125133_meta_preview_receipt_restore_provenance.sql` aceita prova `terminal_receipt` somente com fingerprint idêntico à reserva terminal de origem. Preserva todas as verificações de conta, anúncio, Creative, vídeo, seleção, hashes, objetos e autorização. Provas legadas por manifesto continuam válidas. Sem tabelas, grants, RLS, cron ou endpoints novos.

O primeiro ensaio foi reconciliado exclusivamente no isolado com evidência terminal e correção explícita da metadata de proveniência; não foi contado como novo ciclo limpo. A rodada corrigida fez dois upgrades, rejeitou um escritor concorrente por CAS e restaurou os dois arquivos com nova reserva. Upgrade `96d5a9d6-cafe-4f62-b787-f153e4cac7c6` é terminal failed pelo CAS esperado, com dois recibos updated válidos; restauração `030ce46a-c4dc-40b0-8a15-f0884ce39bce` é success, com dois recibos restored_previous vinculados à origem. Replays mantiveram a mesma reserva e linhas; métricas e objetos anteriores/novos foram conferidos.

## Validação desta rodada

- 119 testes dirigidos no arquivo afetado; uma verificação adicional dos 16 arquivos reais do pacote, executada separadamente, aprovada. Os demais casos omitidos por filtro não foram contados como testes executados.
- Cinco testes do gerador de lote, TypeScript dos módulos alterados, três verificações SQL de proveniência com rollback e integridade dos 18 arquivos publicados no isolado v15: aprovados.
- Auth/REST/RLS reais: editor criou/atualizou resultados de duas frentes; viewer leu os dados; viewer e usuário de outro cliente não gravaram. Dois registros temporários removidos. O sandbox foi reaberto pelo procedimento existente e congelado novamente ao final; nenhuma mudança de acesso em produção.
- Produção: 16 objetos lidos e medidos; quatro HD/Full HD existentes preservam hashes, MIME e dimensões. Cópias anteriores mantidas localmente no pacote privado de reversão.
- Frontend PR #20: 52 testes de criativos e 37 testes de dados ausentes/comercial; oito cenários de categorias/apresentação e oito comerciais, typecheck/build e quatro verificações de empacotamento aprovados. Os cenários de categorias precedem os ajustes finais de texto/origem manual; os testes dirigidos e build refletem o estado final.
- Suíte completa exigida no workflow de publicação: **647 testes aprovados em 57 arquivos**, após os ajustes finais; somente artefatos e cache local de dependências foram excluídos da descoberta.

## Pacote e publicação proposta

`sync-meta-ads`: 14 arquivos, SHA-256 `4f297c0a33517de296107ec474649ab8ba8ab054978dfc519396f895c9a34a79`. Manifesto privado: `5f6875a3fe545a41f04cde085875237a46f68151c1389bfad8db03c4b94cf00b`. A migration acima também integra o gate. Pacote privado, URLs, snapshots e rollback não pertencem ao Git.

Após autorização: revalidar heads/snapshots/configuração; aplicar somente a migration de proveniência; publicar somente o coletor aprovado; conferir arquivos/versão; atualizar primeiro “Entre uma reunião”; verificar bytes/hash/dimensões/identidade/Storage/banco/recibo e imagem autenticada; prosseguir em lotes de até três, priorizando nove comerciais e depois os dois de engajamento. Qualquer divergência interrompe o lote, preservando os demais casos válidos. A Cópia fica preservada.

Concluídos os previews, integrar #21 e #20 nessa ordem. Como o workflow publica a cada push em main, os dois commits de merge usarão `[skip ci]` para evitar deploys intermediários; depois será disparado uma única vez `deploy-pages.yml` por `workflow_dispatch` na main combinada, mantendo typecheck, suíte de testes, build e publicação. O marcador afeta somente push/pull_request, conforme a [documentação oficial do GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs). Revalidar regras/checks antes; não contornar verificações obrigatórias que venham a existir. Conferir Actions/Pages e navegação real. A interface usa os mesmos campos, paths privados e assinatura; não há conflito entre os conjuntos de arquivos. A simulação `git merge-tree` não integrou branches.

Reversão: nova seleção dos hashes anteriores e nova reserva, mantendo recibo de origem. Restaurar arquivos antes de voltar ao coletor v19 ou ao verificador anterior. Reverter frontend pelo último commit Pages conhecido. Backups exatos do coletor/verificador de produção e dos 16 objetos estão preservados. Não apagar objetos novos/antigos durante a reversão.

## Limites para a liberação

O gate não equivale à publicação: nenhum merge, deploy ou imagem real foi gravado. Produção tem Meta/Google/GA4 até 31/10/2026 e cron bem-sucedido em 01/11. A Visão executiva autenticada foi inspecionada. O controle do navegador encerrou ao não confirmar a URL ativa; a navegação real restante e a exibição dos novos previews precisam ser verificadas na publicação. Testes sintéticos não comprovam essa exibição em produção.
