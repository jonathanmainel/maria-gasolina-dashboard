# Gate final de produção — previews aprovados — 29/10/2026

## Resultado

**Homologação da implementação concluída no Supabase isolado. Produção ainda
não publicada e nenhuma imagem real atualizada.** O próximo passo depende de
uma única autorização de produção para a migration adicional, somente Meta e
os sete arquivos aprovados, começando pelo piloto de dois.

## 1. Deploy e pacote homologado

Projeto isolado: `uwafdxsdsgqysjjxfywo`. Versão final de `sync-meta-ads`: **v13**.
Bundle da plataforma:
`c38cb51f1947d39d9cafc911801d25e35e1d0cf22683a8843fa233059e252c95`.
Pacote isolado privado:
`5db1cfd0d813bb6c290d9b05f75b49be2b800e75377b15a6676df8f9c30ac4f4`.
Os 16 arquivos foram recuperados e comparados ao pacote publicado.

Os 11 arquivos comuns de runtime do pacote de produção correspondem aos
homologados, descontando somente o adaptador de ambiente isolado no index.
A configuração privada de manifesto é intencionalmente diferente: uma fixture
sintética no isolado e sete entradas reais já aprovadas no pacote de produção.
Não há adaptador sintético no pacote de produção.

## 2. Única migration adicional

`20261029203211_meta_preview_restored_previous_receipt.sql` foi aplicada somente
no isolado. Há **um registro** dessa migration. As três migrations anteriores
não foram repetidas ou modificadas.

O ajuste altera exclusivamente `verify_dashboard_preview_results`: introduz
`restored_previous` e a contagem `restored`, validando a referência substituída
de um run anterior terminalmente verificado, a nova reserva e o estado realmente
persistido. O recibo individual de origem deve ser `updated`, inclusive quando
outro anúncio tenha feito o lote terminar com falha parcial. Runs indeterminados,
alvos de outro cliente e resultados individuais não confirmados não servem.

Permissões preservadas: `postgres` e `service_role` com EXECUTE; nenhum grant
adicionado; função permanece `SECURITY INVOKER`, com search_path fixo. Piso HD
e validações de atualizações normais foram preservados. Nenhuma tabela, política,
endpoint, secret ou cron foi criado/alterado.

SHA-256 do arquivo SQL final, UTF-8/LF:
`c07736eff1738a3e2d4025f40ad983e08ae9c93bae576c370a0d01870d644ecd`.
O corpo da função instalado corresponde ao final normalizando somente CR/LF:
`40a3f70b8f5a08750718c1c5a70192f1ca8226f40b51e8be9d69d1dc3442118b`.
Durante a homologação, a mesma função foi corrigida para lote parcialmente
falho; não se criou uma segunda migration ou alteração de permissões.

## 3. Fluxo integrado real de ida e reversão

Somente a fixture sintética `800303`, conta sintética `900000000001`, foi usada
nas escritas. Nenhuma mídia ou métrica real de cliente foi escrita no isolado.
Ambos os pedidos finais percorreram:

entrada autenticada → reserva imutável → coordenador existente → guard do coletor
→ Storage privado/banco com CAS → verificação do recibo → reserva terminal.

| Etapa final, com Meta v13 | Run | Resultado confirmado |
| --- | --- | --- |
| Melhoria | `84ebb1ec-df47-48a2-9fa8-c7d31bae5d4a` | HTTP 200, status success, `updated=1`, 1080×1920 persistido |
| Reversão, com nova reserva | `50977836-2b4a-4cdb-b9b4-8103a8708287` | HTTP 200, status success, `restored=1`, recibo `restored_previous`, 64×64 persistido |

Arquivo Full HD:
`05011f70198429cd887e3c376b955182ce6b8b084ddbd2ebfc1cf604ccc655ce`,
11912 bytes, PNG, 1080×1920.
Arquivo anterior restaurado:
`f260a5a987b090e2ab117ef505ba669f5cf9f5c1169f9348bd30d498f5c3dbb1`,
1030 bytes, PNG, 64×64.

Os objetos foram lidos novamente do Storage e medidos; as referências, hashes,
dimensões e recibos do banco coincidem. O recibo de reversão aponta para o run
de melhoria final. Nenhum objeto foi apagado ou sobrescrito; a reversão reutiliza
o objeto anterior. O objeto Full HD continua disponível depois da reversão.
Reenvios das mesmas chaves retornaram os mesmos runs sem novas gravações.
O cooldown real de cinco minutos foi respeitado entre as reservas.

Houve uma falha concreta na primeira tentativa: o banco validou a restauração,
mas a lista de sucessos HTTP do Meta ainda não incluía o novo recibo. O coordenador
reteve corretamente o run como indeterminado. Depois de confirmar o encerramento
e a igualdade dos recibos, a RPC preexistente e exclusiva do isolado reconciliou
esse teste. Corrigiu-se uma condição no index Meta e repetiu-se o ciclo afetado
com novas reservas. **O ciclo final acima terminou automaticamente**, sem essa
reconciliação. Nenhuma RPC de teste foi transportada para produção.

## 4. Segurança e integridade

- Typecheck dirigido aprovado; **165 testes afetados aprovados**. O teste opcional
  de mídia real foi executado separadamente e passou para os sete arquivos.
- Cobertura de hash/manifesto divergente, URL/redirect proibidos, identidade
  ambígua, qualidade insuficiente, anti-downgrade normal, CAS, replay e recibos.
- A restauração não aceita uma URL de cliente: o alvo vem do manifesto fixado,
  da referência anterior comprovada e do recibo individual do run original.
- O coletor mede o objeto privado antigo e confirma SHA-256/MIME antes de CAS.
  A exceção de resolução só existe para `restored_previous`; não libera downgrade
  como `updated` e não reduz o piso HD das melhorias.
- Os **19 conjuntos protegidos** comparados antes/depois ficaram idênticos:
  14 tabelas de métricas/CRM/rede, contas-fonte, clientes, vínculos de usuários,
  controle do isolado e todos os previews exceto a fixture autorizada.
- Sincronização normal Meta em dry run final: HTTP 200, ok=true, sem escrita.
- Reservas ativas finais no isolado: **zero**. Auditoria dos pedidos preservada.
- Nenhuma mudança em Google Ads, GA4, CRM, cron, secrets, RLS ou frontend.

## 5. Sete arquivos reais confirmados e piloto

Os sete arquivos oficiais foram recuperados e validados com o código real e o
pacote final exato: MIME, dimensões e SHA-256 aprovados. As sete bases CAS e os
objetos anteriores de produção foram conferidos por leitura e coincidem com o
manifesto. O runtime repetirá as verificações antes de qualquer escrita.

| Anúncio | ID | Arquivo aprovado | Ordem |
| --- | --- | --- | --- |
| AD3 — Mais do que uma franquia | 120251781898970114 | 1080×1920, Full HD | Piloto |
| AD1 — INVESTIMENTO ALTAMENTE | 120251464998300114 | 720×1280, HD | Piloto |
| AD2 — GANHAR DINHEIRO EM 2026 | 120251465059580114 | 1080×1920, Full HD | Após piloto |
| AD3 — ESSA É A HISTÓRIA | 120251465070010114 | 1080×1920, Full HD | Após piloto |
| AD01 — | 120233201881890114 | 1080×1920, Full HD | Após piloto |
| Novo anúncio de Engajamento | 120241847281150114 | 1080×1920, Full HD | Após piloto |
| Novo anúncio de Engajamento — Cópia | 120242286711110114 | 1072×1928, HD | Após piloto |

Total candidato: cinco Full HD e dois HD. **Não são imagens já atualizadas.**
CTV01, CTV02 e CTV04 permanecem excluídos, sem nova investigação. CTV 1 —
Depoimento e os outros 33 não integram a operação.

## 6. Pacote exato e reversão operacional

Somente `sync-meta-ads`, 12 arquivos, projeto `hlqrpreqvvxtkruwsolg`:
`0beb5489c7cb2b68391680e587430bfcf33940722c057d7b2939725213ffc389`.
Manifesto privado fixado:
`94ff6ed405876d5b77fec4ed71427772c6921f476847f7d7977700d93f28b6a1`.
Pacote privado completo do gate (função, SQL, pedidos e sete backups):
`8c1ab6023457e795a533ff9c5671b5ed2e6c322c1db1bff7406710f17d86da61`.
Os arquivos privados permanecem fora do Git, sem tokens ou URLs assinadas em logs.

Reversão validada:

1. Interromper novos lotes e confirmar o estado terminal do pedido anterior.
2. Conferir caminho/hash/versão atuais e o alvo antigo aprovado; não rebater
   alterações concorrentes nem reutilizar reserva concluída.
3. Pela mesma entrada autenticada, pedir nova reserva de previews para **somente
   os anúncios efetivamente atualizados**, aprovando o SHA-256 anterior fixado.
4. O coletor identifica a intenção pelo manifesto, comprova o run de origem,
   lê o objeto antigo privado, valida seus bytes e usa CAS para restaurar a
   referência e os metadados de preview. Dados comerciais não são rebobinados.
5. Conferir arquivo, referência e recibo `restored_previous`, com origem e
   contagem própria. Preservar também o objeto HD para auditoria.

Não há UPDATE avulso, upload arbitrário ou endpoint paralelo. A Meta v18 está
preservada para reversão de código, mas **não deve substituir a função nova antes
de concluir uma reversão de imagens que dependa de restored_previous**. Não
remover migrations aditivas ou objetos. Qualquer resultado indeterminado mantém
a exclusão até confirmação; não realizar retries cegos.

## 7. Publicação proposta e limite da autorização

Produção confirmada ainda em Meta v18, coordenador v12, entrada v2. A migration
de restauração ainda **não** está aplicada em produção. Main permanece
`144534eb997662a5ba6a84dc7b353dbc4e99ad6a`. O PR não foi integrado e seu diff não
inclui mudanças adicionais de frontend nesta etapa.

Após autorização única:

1. Conferir novamente pacote, backups, bases CAS e ausência de reserva conflitante.
2. Aplicar somente a migration adicional acima, uma vez, e publicar somente Meta.
   Conferir corpo da função SQL, permissões, versão e arquivos efetivos.
3. Executar o piloto dos dois pela entrada autenticada e protocolo existente.
4. Exigir persistência, hashes/dimensões, recibos e imagens corretas no dashboard
   autenticado, cards e modais; qualquer falha interrompe os próximos lotes.
5. Somente com aprovação integral do piloto, executar os outros cinco em lotes
   pequenos, com reservas novas e verificações individuais.
6. Confirmar as sete imagens reais, Top 3, Top 9, apresentação, filtros, métricas
   e integrações; documentar, integrar PR #10 e verificar Actions/Pages.

**Não há bloqueio técnico pendente da homologação. Falta autorização de produção.**
A persistência/inspeção visual das sete imagens reais, merge e publicação final
continuam sendo trabalho futuro condicionado a essa autorização. Evidências:
`artifacts/meta-preview-restoration-20261029/`, incluindo o ciclo final na pasta
`response-fix/`. Nenhuma escrita real ou deploy de produção ocorreu nesta etapa.
