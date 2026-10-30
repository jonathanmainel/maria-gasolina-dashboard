# Fechamento da primeira fase — previews Meta Ads — 30/10/2026

## Entrega aceita

A fase foi encerrada pelo usuário com **quatro previews realmente atualizados**:
três Full HD e um HD, persistidos no Supabase privado e conferidos no dashboard
publicado com sessão administrativa autenticada. Os três candidatos de engajamento
ficaram excluídos do recorte desta entrega. A classificação comercial existente,
os indicadores, funis e filtros foram preservados.

Não se confunde merge/Pages com gravação de mídia: os quatro arquivos foram
atualizados pelo protocolo operacional antes da integração deste PR. O estado
final da integração e do workflow Pages fica registrado no
[PR #10](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/10).

## Quatro arquivos publicados

Todos são JPEG; dimensões medidas novamente dos bytes recuperados do Storage
privado pela sessão autenticada. Hashes reais, referências do banco e recibos
terminais coincidem.

| Anúncio | ID | Dimensões | Qualidade | Recibo |
| --- | --- | --- | --- | --- |
| AD3 — Mais do que uma franquia | 120251781898970114 | 1080×1920 | Full HD | updated |
| AD1 — INVESTIMENTO ALTAMENTE | 120251464998300114 | 720×1280 | HD | updated |
| AD2 — GANHAR DINHEIRO EM 2026 | 120251465059580114 | 1080×1920 | Full HD | updated |
| AD3 — ESSA É A HISTÓRIA | 120251465070010114 | 1080×1920 | Full HD | updated |

SHA-256, na mesma ordem:

- `a1079185835e4788f58a424fb12f1003aa0f4d532a830a16b46a3ca3a19eb2cf`
- `19ca2c2b38962ca8d775a48411c7d3fb698ad57073d70d5b7979aac0d28bded4`
- `e9776a96caf34bd99f7c398615376fcadc63688e8c1ac2557ab89d9d32e546ff`
- `c075b267bf4fa1e0b127593e04b03e50e4c6ad596cb47ad9d7ea77eb0330525e`

Piloto: run `af0fa2b5-17c3-43c4-9102-85f6ae202a44`, success, updated=2.
Lote seguinte: `7ed88c3d-94c4-404e-a40f-1b5678ae8597`, success, updated=2.
Ambos percorreram entrada autenticada → reserva imutável → coordenador → guard
Meta → Storage/banco com CAS → recibo terminal verificado. Nenhum token foi
extraído, nenhuma reserva reutilizada e nenhum acesso privilegiado substituiu
a sessão administrativa da aplicação.

Os quatro foram abertos nos modais reais. AD3 e AD2 foram conferidos também
nos cards do ranking e na apresentação. AD1 e o anúncio da história foram
conferidos nas miniaturas do detalhamento e nos modais, pois não integram o
Top 9 do período consultado. Não se alterou a ordenação para forçá-los ao ranking.
Top 3/Top 9, filtro de período e apresentação foram exercitados sem alterar dados.

## Três candidatos excluídos por classificação

| Anúncio | ID | Arquivo aprovado disponível | Decisão |
| --- | --- | --- | --- |
| AD01 — | 120233201881890114 | 1080×1920 Full HD | Não atualizar nesta fase |
| Novo anúncio de Engajamento | 120241847281150114 | 1080×1920 Full HD | Não atualizar nesta fase |
| Novo anúncio de Engajamento — Cópia | 120242286711110114 | 1072×1928 HD | Não atualizar nesta fase |

Os arquivos oficiais exatos, hashes e identidades foram validados no dry run
anterior e permanecem no corpus privado. Suas campanhas são de engajamento e
não pertencem às frentes comerciais hoje exibidas. O usuário determinou
preservar essa classificação, sem atribuição artificial a Expansão ou Places.
Não houve reserva, upload ou atualização desses três anúncios. O pedido do
último lote ficou apenas preparado localmente e nunca foi despachado.

**Melhoria futura possível, não implementada:** avaliar uma galeria separada
para campanhas de engajamento, com escopo e autorização próprios. Ela não deve
alterar os indicadores, funis, filtros ou a classificação comercial existente.

CTV01, CTV02 e CTV04 permanecem uma pendência separada de representação dinâmica,
sem nova investigação nesta conclusão. Os outros 33 registros não foram objeto
de auditoria ou atualização. CTV 1 — Depoimento (`120242449606530114`) foi
preservado; nova leitura confirmou 1080×1920 e SHA-256
`c317ae80be49469135befa760b4292c3d080db34cc1726323304d455b0c6661b`.

## Integridade e estado já publicado

- 17 conjuntos de métricas/CRM/contas/clientes/vínculos idênticos antes/depois
  das quatro atualizações e novamente na conferência final; zero reservas ativas.
- Os únicos previews modificados durante a operação foram os quatro acima.
  Objetos anteriores e backups privados preservados; nada apagado ou sobrescrito.
- Produção permanece em Meta v19, coordenador v12, entrada v2, Google Ads v8,
  GA4 v10 e importação v5. Esta conclusão não repetiu migrations, deploys de
  Edge Functions ou atualizações de imagens.
- Código executável autorizado em `ca12017b52d11375c6f59f50e28ff5e16888cb33`.
  Pacote privado Meta publicado:
  `0beb5489c7cb2b68391680e587430bfcf33940722c057d7b2939725213ffc389`.
  Bundle v19: `ed4492b765d2cef533a26668c7adf94dfd54d92cec66ca47ae318c12a2a3a0dd`.
- A migration de restauração já aplicada tem arquivo
  `20261029203211_meta_preview_restored_previous_receipt.sql`, SHA-256 UTF-8/LF
  `c07736eff1738a3e2d4025f40ad983e08ae9c93bae576c370a0d01870d644ecd`.
  A API registrou em produção o nome `meta_preview_restored_previous_receipt`
  com versão `20261030122336`. É a mesma aplicação, não uma migration adicional.
  Conferir nome/corpo antes de automações futuras; não reaplicar por divergência
  do timestamp local. SECURITY INVOKER, search_path e ACL preservados.
- Homologação já concluída: typecheck dirigido, 165 testes afetados, leitura dos
  sete arquivos aprovados e ciclo sintético completo de atualização/restauração
  com CAS, idempotência e recibo `restored_previous`. Nenhuma bateria foi refeita
  nesta conclusão documental; o workflow Pages executa os checks normais do repo.

## Configuração privada e reversão

O Git contém somente o pin público de integridade e os IDs aprovados. Manifesto,
fontes assinadas, backups, pacotes e credenciais permanecem fora do Git. As
imagens de teste versionadas são rasters sintéticos gerados pelo Pillow.

O único workflow publica o frontend no GitHub Pages; não aplica SQL e não faz
deploy de Edge Functions. Portanto o merge não sobrescreve o manifesto privado
embutido no pacote Meta v19. Nenhuma configuração sensível foi incorporada ao
frontend. Um futuro deploy manual do Meta deve usar o empacotador e o manifesto
privado autorizado; o checkout público isolado falha fechado para esses IDs.

A reversão continua disponível somente para uma atualização comprovada, com
backup íntegro, nova reserva autenticada, exclusão legítima, hash anterior fixado,
CAS e recibo `restored_previous`. Não há UPDATE avulso ou remoção de objetos.
Caso necessária, restaurar imagens com v19 antes de qualquer volta do código
para v18. Nenhum rollback foi necessário nesta fase.

As evidências detalhadas e screenshots autenticados permanecem privadamente em
`artifacts/meta-preview-production-20261030/`. Este documento registra os
resultados sem publicar arquivos reais do cliente, sessões ou URLs assinadas.
