# Homologação remota da referência aprovada e bloqueio de reversão — 29/10/2026

> Atualização: a extensão autorizada foi implementada e homologada, inclusive
> ida/reversão sintéticas pelo fluxo completo. O estado final e os pacotes estão
> no [gate final de produção](gate-final-producao-2026-10-29.md). Este relatório
> preserva o diagnóstico anterior à autorização da extensão.

## Resultado objetivo

O pacote autorizado `0bf1e7d9e58ad1c21cfcd4f7a188bba3c0722a43579efc2eaa71db331f8e8f30`
foi publicado **somente** em `uwafdxsdsgqysjjxfywo`, função `sync-meta-ads`,
versão **10**, ACTIVE. Os 16 arquivos foram recuperados e comparados ao pacote:
correspondência integral, normalizando apenas quebras de linha. Configuração
de autenticação preservada. Bundle retornado pela plataforma:
`e4dcc4c51becfbf5b1c3788b4b90a35411dbe7a319edf7b0d9a9f68b8ad3a294`.

Não houve deploy em produção, migration, alteração de coordenador/entrada,
cron, secret, permissão ou RLS. Não houve novas reservas ou escrita de previews,
nem mesmo no isolado. Nenhum objeto foi removido ou enviado ao Storage.

## Dry runs no Edge Runtime real

Foram utilizados somente os IDs sintéticos já existentes `800301` e `800303`,
conta sintética `900000000001`. Auth/REST/Runtime são reais; Graph e os arquivos
destes casos são o provedor sintético do pacote isolado. Não há token ou dado
real de cliente nesses arquivos de teste.

| Caso | HTTP | Resultado |
| --- | --- | --- |
| Referências aprovadas, listagem com Meta code 10 | 200 | Dois hashes exatos aceitos, `preview_approved_reference_valid`; coleção continua marcada incompleta |
| Tentativa HD sobre Full HD existente, 800301 | Incluída no caso anterior | `preserved_not_better`: sem downgrade |
| Candidato Full HD sobre HD existente, 800303 | Incluída no caso anterior | `improved` no planejamento; sem persistência por `dry_run=true` |
| Repetição somente leitura | 200 | Mesmas decisões e nenhuma escrita/reserva |
| SHA aprovado divergente do manifesto | 207 | Ambos rejeitados com `preview_manifest_reservation_mismatch` |
| Sincronização normal de métricas, dry run | 200 | `ok=true`, sem escrita |

O manifesto isolado teve o digest validado em execução:
`2e283be31fb9902d31d74e800b7963fe64045a5dee4f64125b75b968cf831f6c`.
Os arquivos medidos são PNG reais: 720×1280 (hash
`febabf2fde9f81e741fc027e21d635c10b75410f205f52e64a4df93c58dbf688`)
e 1080×1920 (hash
`05011f70198429cd887e3c376b955182ce6b8b084ddbd2ebfc1cf604ccc655ce`).

Snapshots de **17 conjuntos**, antes/depois, foram idênticos: as 14 tabelas
protegidas de métricas/CRM/rede, previews, reservas e objetos do Storage.
Zero novas reservas, zero alteração de referências e zero gravação de previews.
A repetição dry run comprova repetibilidade de leitura, não idempotência de uma
escrita que não foi executada.

## Sete candidatos e três exclusões

Não se reabriu a investigação dos três CTVs ou dos outros 33 anúncios.
Permanecem os sete aprovados do manifesto: cinco Full HD e dois HD. A prova
anterior carregou o pacote privado de produção exato e validou, com o código
real, MIME, dimensões e SHA-256 dos sete arquivos oficiais por GET sem escrita.
O manifesto não mudou. CTV01, CTV02 e CTV04 continuam fora dele e da publicação.

O piloto preparado continua AD3 — Mais do que uma franquia,
`120251781898970114` (1080×1920), mais AD1 — INVESTIMENTO ALTAMENTE,
`120251464998300114` (720×1280). Nenhuma execução real foi iniciada.

## Fluxo completo: o que está e o que não está comprovado

O protocolo original já tem testes integrados reais de entrada autenticada,
reserva, coordenador, guard, Storage privado, CAS e recibo terminal. A nova fonte
tem testes locais de escrita em memória que percorrem a persistência/CAS, além
da validação remota acima, sem alteração dos componentes de entrada/coordenador.

Entretanto, ainda não foi executado um novo ciclo com **escrita sintética real**
ligando a nova fonte até Storage/banco/recibo terminal no Edge Runtime. Não se
declara esse ciclo concluído com base em download, HTTP 200 ou dry run. Ele exige
a autorização específica prevista pelo usuário para testes além de dry runs.

## Reversão: impedimento comprovado

Foram consultadas as operações existentes em produção e no isolado. Há somente
`request_dashboard_preview_sync`, `begin_dashboard_preview_collection` e
`verify_dashboard_preview_results`; não há restauração operacional implementada.

O validador instalado no isolado tem hash de definição
`cc0661b22ef2b8096491e8d1b239e4f3`: exige piso HD para `updated` e
`preserved_adequate`, não aceita um recibo de restauração e exige manter o caminho
e hash do snapshot para resultados de preservação. O coletor também mantém
anti-downgrade. Assim, um arquivo antigo 64×64 não pode ser restaurado como
atualização HD nem como preservação da referência atual. Fazer UPDATE avulso,
inventar um erro terminal ou alterar o rótulo para simular sucesso seria incorreto.

Os backups privados dos sete e suas referências anteriores estão íntegros e já
foram conferidos por hash; o pacote Meta v18 efetivamente publicado também está
preservado. Isso garante disponibilidade para recuperação, mas **não comprova
um procedimento operacional de restauração pelo protocolo**.

## Menor correção proposta — não implementada

Manter `operation=previews`, a entrada autenticada, a reserva imutável e o
coordenador existentes. A intenção de restauração seria determinada exclusivamente
pela referência anterior fixada no manifesto privado e pelo hash aprovado na
nova reserva, nunca por URL ou dados arbitrários fornecidos pelo navegador.

1. Acrescentar ao coletor Meta a restauração restrita do **objeto anterior já
   existente**. Exigir cliente/conta/anúncio/creative/vídeo/asset correspondentes,
   referência anterior aprovada, integridade do backup e vínculo ao run original
   de melhoria confirmado. Não fazer upload, transformação ou exclusão de objeto.
2. Obter nova reserva/exclusão pelo fluxo existente e usar seu snapshot atual
   para CAS de caminho/hash/versão. Divergência concorrente mantém tudo bloqueado;
   a reserva concluída nunca é reutilizada.
3. Produzir recibo explícito `restored_previous`, com alvo, hash, dimensões e run
   de origem. O piso HD deixa de ser aplicável **somente à restauração comprovada**;
   o anti-downgrade das atualizações normais permanece integralmente igual.
4. Uma migration aditiva nova e limitada atualizaria o validador de recibos para
   esse resultado: conferir a reserva atual, a aprovação do alvo, o registro
   terminal original, a referência anterior daquele run e o objeto privado
   realmente persistido. Registrar contagem `restored` separada de `updated`.
   Não criar tabelas, grants, endpoint, segredo ou caminho privilegiado paralelo.
5. O coordenador atual aceita o status e as contagens verificados pelo RPC;
   não há necessidade identificada de republicá-lo ou alterar a entrada. O tipo
   compartilhado do recibo e os testes Meta teriam o novo resultado explícito.

Escopo previsto: coletor/helper e recibos Meta, tipo do recibo, testes e **uma
migration adicional de validação**, sem repetir/editar as três já aplicadas.
Essa exceção à restrição de novas migrations precisa de autorização antes da
implementação. Não foi produzido ou aplicado DDL nesta etapa.

## Teste integrado mínimo a autorizar, somente sintético e isolado

Um único caso de ida e volta, utilizando o harness e a autenticação existentes:

- Preparar uma fixture sintética de baixa resolução no projeto isolado, com
  backup e snapshot; nenhuma informação real de cliente.
- Pedir a melhoria por entrada autenticada → nova reserva → coordenador → coletor
  → objeto privado imutável → CAS → recibo `updated` confirmado. Verificar hash,
  dimensões e reenvio idempotente da mesma chave sem duplicação.
- Pedir a restauração por nova reserva no mesmo fluxo, conferindo o vínculo ao
  run original. Restaurar a referência antiga abaixo de HD e confirmar o recibo
  `restored_previous`, sem apagar o objeto HD nem recriar o antigo.
- Verificar rejeições de alvo/hash/run de origem divergentes, exclusão e CAS,
  além de invariância das métricas e auditoria dos dois pedidos. Respeitar o
  cooldown existente, sem limpar reservas ou reduzir proteções para acelerar.

As escritas seriam exclusivamente de fixture/preview sintéticos e dos registros
de reserva/auditoria necessários no isolado. Produção continuaria intocada.

## Pacote e gate de produção

O pacote atual de produção preparado para **recuperação direta**, ainda sem a
extensão de restauração, continua com SHA-256
`b9c6c4cccff4b69e858cbf3ee4c06f9d42d12680070f8f0983e0879f90b9465a`.
Não é apresentado como pacote final aprovado para produção: o requisito de
reversão está aberto. A implementação autorizada da correção exigirá novo pacote
e digest, mais o escopo SQL adicional explicitamente revisado.

Somente após o teste de ida/reversão comprovado será apresentado o gate único
de produção solicitado. Não foi pedida ou utilizada autorização de produção aqui.
Evidências privadas/seguras: `artifacts/meta-direct-finalizacao-20261029/`.
