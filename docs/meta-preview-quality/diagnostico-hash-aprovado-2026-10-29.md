# Diagnóstico dos dois previews e correção restrita por hash — 29/10/2026

## Conclusão comprovada

Os dois arquivos aprovados continuam recuperáveis pelas fontes oficiais. Foram
baixados novamente por GET a partir das referências oficiais já presentes no
corpus, decodificados e confrontados com seus SHA-256. Nenhuma URL assinada
completa foi registrada nos novos diagnósticos. Não houve reservas ou gravações
de produção, consulta aos oito restantes ou investigação dos outros 33.

| Anúncio | ID | Creative atual | Vídeo atual | Arquivo recuperado |
| --- | --- | --- | --- | --- |
| CTV01 | 120246159821230114 | 1380678307194655 | 1632637051124343 | HTTP 200, 167180 bytes, 720×1280, hash aprovado exato |
| AD3 - Mais do que uma franquia | 120251781898970114 | 1071980245374661 | 1095304406487964 | HTTP 200, 386950 bytes, 1080×1920, hash aprovado exato |

Hashes aprovados e recuperados:

- CTV01: `b2345046f591ddf84b82e404b7fc51807e00b6f841a4016bd7b75d9a3ca2c076`.
- AD3: `a1079185835e4788f58a424fb12f1003aa0f4d532a830a16b46a3ca3a19eb2cf`.

O MCP Meta confirmou anúncio→creative e creative→vídeo, sem divergência das
identidades aprovadas. Na consulta da biblioteca de vídeos, CTV01 foi resolvido
como ready; AD3 não foi resolvido nessa consulta. Isso não prova remoção nem
falta de permissão, e não invalida a recuperação dos bytes oficiais acima.

## Causa do erro genérico e limite da evidência atual

Um novo dry run na v17, com os mesmos dois IDs e sem impor hashes (somente para
observar o seletor geral, dry_run=true), retornou `pending_collection_incomplete`
e `preview_collection_incomplete` para ambos. Comparações medidas: zero. O
seletor não chegou a escolher uma imagem nessa execução; portanto, não há um
"hash vencedor atual" observado nem prova de ausência do aprovado na coleção.

O fluxo publicado faz `collectionIncomplete → selected=null → !file →
preview_approved_candidate_unavailable`. Isso comprova por que o erro genérico
mascarou a etapa real do bloqueio. A obtenção da coleção oficial é o bloqueio
observado para ambos; a API configurada no coletor é v26.0.

**O motivo técnico interno da coleção incompleta ainda não está comprovado.**
A v17 não devolve `lookup_errors` nas decisões dessa falha. Não se atribuiu
permissão, expiração, mudança da API ou limite de paginação sem o respectivo
código. Os novos diagnósticos tornam essa evidência acessível no próximo dry
run remoto, após revisão e autorização do pacote Meta. Não é necessário nem
autorizado alterar secrets ou contornar a coleção incompleta.

## Defeito independente no seletor, reproduzido e corrigido

O código anterior registrava o hash revisado, mas só o selecionava se largura
e altura fossem pelo menos as da melhor imagem. Um teste HD aprovado + Full HD
válido falhou antes da correção: o hash Full HD prevaleceu. Esse defeito pode
produzir rejeição falsa, mas **não foi demonstrado como causa das duas falhas
reais atuais**, que ocorreram antes da seleção.

A alteração adiciona `required` somente à indicação interna derivada de
`reservationSelection.approved_assets`. Com hash obrigatório:

1. Percorre os candidatos oficiais recuperados dentro do limite existente,
   inclusive fallbacks oficiais, sem encerrar a busca só por encontrar Full HD.
2. Usa os bytes decodificados e seus hashes; procura exatamente o aprovado.
3. Exige identidade e qualidade/proporção válidas; rejeita match insuficiente.
4. Seleciona o match autorizado mesmo se outra imagem for maior.
5. Sem match válido, não seleciona outra imagem nem inicia fallback de frame.

O algoritmo geral de qualidade, a preferência suave de metadados legados, a
verificação do arquivo anterior, anti-downgrade, CAS, reservas, autenticação,
coordenador, migrations e recibos permanecem com o comportamento anterior.

## Diagnósticos

Foram separados: hash válido; hash válido que perdia no ranking geral; hash
não encontrado; arquivo correspondente abaixo dos requisitos; identidade
divergente; coleção incompleta; limite de paginação; limite de candidatos;
downloads inconclusivos. As decisões incluem quantidade de candidatos e de
arquivos medidos, SHA aprovado/encontrado/vencedor geral, dimensões e hashes
reais por candidato, origem, erros técnicos seguros e divergências dos hashes.

Uma falha de download sem bytes não permite saber o hash daquele arquivo;
por isso é registrada como `preview_approved_download_unconfirmed`, com erro
individual, e nunca como ausência definitiva. Da mesma forma, hashes diferentes
dos arquivos recuperados são contados sem afirmar que um endereço específico
foi reencodificado. O diagnóstico não inventa essa associação.

Os erros da coleção são registrados antes de lançar a falha, preservando
`lookup_errors`. URLs completas, tokens e mensagens brutas da API não entram
nos registros. Índices e nomes de origem identificam os candidatos.

## Validação e pacote

- 219 testes backend em 16 arquivos aprovados. Dez novos testes/casos abrangem
  HD autorizado contra Full HD, hash ausente, identidade, qualidade insuficiente,
  download, limites, fallback oficial, paginação, erro Meta seguro e anti-downgrade.
- O teste de regressão principal foi executado e falhou no código anterior.
- Meta v9 publicada exclusivamente no Supabase isolado `uwafdxsdsgqysjjxfywo`.
- Edge Runtime real, Auth/REST reais e provedores sintéticos: dry run com hash
  HD encontrou o autorizado apesar do Full HD concorrente; o Full HD existente
  foi preservado contra downgrade. Hash ausente retornou HTTP 207 e rejeição
  específica. Ambos sem escrita, sem reservas e com linhas de previews idênticas.
- Dry run real da v17: coleção incompleta para os dois; bytes aprovados
  recuperados diretamente nas fontes oficiais com HTTP 200, hash/dimensões exatos.
- As 14 tabelas protegidas de produção continuam com os mesmos conteúdos e
  contagens do baseline da publicação. Nenhuma alteração de métricas ou mídia.

Diff executável: somente `sync-meta-ads/meta-creative.ts`; testes em
`sync-meta-ads/preview-quality.test.ts`. Não há alteração dos demais componentes.
O novo pacote é exclusivamente `sync-meta-ads`, preparado separadamente dos
pacotes históricos para não os sobrescrever. Produção permanece na v17.

## Condições para retomar

O diff e pacote estão prontos para revisão antes de qualquer redeploy em produção.
Após autorização, publicar somente Meta; executar somente o dry run dos dois
para obter os códigos técnicos atuais, exigir coleção completa e confirmar os
dois hashes. Somente com isso resolvido poderá ser retomado o piloto pelo
protocolo legítimo. Nenhuma reserva/piloto ou lote dos oito foi executado aqui.
Não foi proposto nem implementado caminho de upload do corpus local, pois os
mesmos bytes ainda são recuperáveis nas fontes oficiais.
