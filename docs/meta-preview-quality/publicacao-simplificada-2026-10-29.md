# Publicação simplificada dos previews — 29/10/2026

> Fechamento em 30/10/2026: quatro previews publicados e validados; três de
> engajamento excluídos por decisão de recorte, sem alterar a classificação.
> Ver [conclusão desta fase](conclusao-pr10-2026-10-30.md). O texto abaixo é histórico.

> Atualização após autorização final: migrations e backend publicados em
> produção. O dry run remoto do piloto não confirmou os candidatos aprovados;
> nenhuma imagem foi alterada e os lotes foram interrompidos. Ver
> [resultado da publicação controlada](producao-2026-10-29.md).

## Entrega 1: publicada

O PR [#19](https://github.com/jonathanmainel/maria-gasolina-dashboard/pull/19)
extraiu somente a apresentação vertical sobre a main `7ab0c393`, preservando
os PRs #11–17. Merge `144534eb997662a5ba6a84dc7b353dbc4e99ad6a`.
O [workflow Pages 40894057862](https://github.com/jonathanmainel/maria-gasolina-dashboard/actions/runs/40894057862)
e o deployment `7415380653` terminaram em sucesso (29/10, 11:43 de São Paulo).

Validação: typecheck, 57 testes frontend relevantes em sete arquivos, build
Pages e seis Playwright em 1440×1000 e 390×844: Franquias, Condomínios,
Top 3/Top 9, modal e apresentação. Corrigida uma diferença pontual no cálculo
da moldura mobile. A aplicação publicada foi aberta com sessão autenticada:
cards reais, aviso de baixa resolução, modal com dimensões, sem erros de console.
Nenhum backend ou arquivo real foi publicado nesta entrega; a resolução atual
permanece a mesma. A main publicada foi incorporada ao PR #10; seu frontend é
idêntico ao publicado, sem alterações em `src/`, workflows ou Google/GA4 no diff restante.

## Entrega 2: protocolo homologado; produção ainda depende do gate

Projeto isolado: `uwafdxsdsgqysjjxfywo`. As implementações já existentes foram
reutilizadas. Código executável local confrontado com entrada v2, coordenador
v2 e Meta v7 do sandbox; não foi necessário repetir seus deploys.
Auth, RPCs, banco, pg_net, Storage privado e Edge Runtime são reais. Somente
respostas dos provedores e imagens de teste são sintéticas.

Contrato: finalidade `metrics` (padrão) ou `previews`; seleção e identidade
anterior imutáveis, fingerprint, conta/cliente/fonte e hashes aprovados;
despacho pelo coordenador existente, guard exato e reivindicação única.
Recibos específicos são confrontados com banco, objetos privados, identidade,
dimensões e referência anterior antes da confirmação terminal. Previews não
atualizam métricas nem a indicação de atualização das métricas.

As três migrations já aplicadas exclusivamente no sandbox são uma extensão
aditiva do protocolo: quatro campos na reserva, wrappers compatíveis e duas
correções de prova terminal/status encontradas naquela homologação. Mantêm-se
separadas para preservar esse histórico, sem novas tabelas em produção, cron,
secrets, RLS, permissões existentes ou mudanças nos coletores Google/GA4:

1. `20261028181122_meta_preview_reservation_protocol.sql`.
2. `20261028185400_meta_preview_receipt_validation.sql`.
3. `20261028185700_meta_preview_status_compatibility.sql`.

Resultados confirmados:

- 209 testes backend em 16 arquivos, 15 testes Python locais de mídia e asserções
  SQL do protocolo, com rollback.
- Lote `a8d15392-d011-47f0-bd56-4981bfe8fc2e`: seis arquivos sintéticos
  atualizados, quatro preservados, recibo terminal confirmado.
- Idempotência `0cf866a0-c21d-4116-9924-1ac701384421`: zero atualizações e dez
  preservados. Objetos anteriores e atuais conferidos por hash e decodificação.
- Falhas controladas: download, Storage, banco e CAS produziram resultados
  específicos; o lote não foi declarado bem-sucedido.
- Timeout `a615220f-d57a-47b0-8bd4-e5b70f75802c`: exclusão mantida enquanto o
  coletor trabalhava; reconciliação recusada sem término e sem prova no banco,
  aceita somente após ambos. Estado final success; nenhuma métrica alterada.
- Comparação completa das onze tabelas de métricas/CRM antes e depois das
  operações de preview: mesmos conteúdos e contagens.
- Sincronização normal `bce90f00-e7c0-4326-9841-1ec578bbba83`, com finalidade
  padrão metrics: success, métricas persistidas e previews existentes preservados.
- Vinte verificações de rejeição: sessão ausente, viewer/editor, outro cliente,
  fonte, IDs/identidade inválidos, payload extra e RPCs não públicas.
- Storage: assinatura e bytes para membros autorizados; outro cliente, anônimo
  e acesso público rejeitados. Renovação das URLs privadas confirmada.

## Dez candidatos e piloto preparado

Leitura atual de produção limitada aos dez candidatos e ao CTV 1 preservado.
Os onze objetos atuais foram baixados por GET, decodificados e conferidos
contra os hashes do banco/corpus. Nenhuma escrita remota foi feita.

| Anúncio | ID | Candidato |
| --- | --- | --- |
| CTV01 | 120246159821230114 | HD 720×1280 |
| CTV02 | 120246161019030114 | HD 720×1280 |
| CTV04 | 120246161118490114 | HD 720×1280 |
| AD1 - INVESTIMENTO ALTAMENTE | 120251464998300114 | HD 720×1280 |
| AD2 - GANHAR DINHEIRO EM 2026 | 120251465059580114 | Full HD 1080×1920 |
| AD3 - ESSA É A HISTÓRIA | 120251465070010114 | Full HD 1080×1920 |
| AD3 - Mais do que uma franquia | 120251781898970114 | Full HD 1080×1920 |
| AD01 - | 120233201881890114 | Full HD 1080×1920 |
| Novo anúncio de Engajamento | 120241847281150114 | Full HD 1080×1920 |
| Novo anúncio de Engajamento — Cópia | 120242286711110114 | HD 1072×1928 |

CTV 1 - Depoimento (`120242449606530114`) mantém o Full HD atual e fica fora
de todos os pedidos. Os 33 restantes não foram consultados nesta entrega.

Dry run local: os dez anúncios passaram pelo seletor real do PR, usando a
coleção oficial completa previamente recuperada, os bytes reais e a fotografia
atual conferida do Storage. Os dez hashes escolhidos coincidem com os aprovados;
cinco HD e cinco Full HD são melhorias, com zero escrita/rede no dry run.
Há uma asserção adicional de preservação do CTV 1. Este ensaio não é uma chamada
ao coletor de produção e não comprova disponibilidade futura da Meta/CDN:
o piloto deve resolver novamente a fonte e exigir o hash aprovado; se ela
estiver indisponível ou diferente, deve preservar o arquivo atual e registrar falha.

Piloto: AD3 - Mais do que uma franquia e CTV01, uma peça Full HD e uma HD da
mesma conta. Pedido privado preparado com IDs, creative/vídeo e hashes exatos.
Gerar uma chave UUID nova somente após autorização. Validar recibos, bytes,
dimensões, referências anteriores e invariância das métricas antes dos oito
restantes, em lotes pequenos, respeitando cooldown e exclusão.

## Pacotes e reversão

`scripts/package-meta-preview-release.mjs` prepara somente os três pacotes
de produção e as migrations ordenadas; rejeita imports do adapter de testes,
não inclui coletores Google/GA4, não lê secrets e não faz deploy.
`scripts/prepare-meta-preview-release.py` permite apenas GET dos objetos da
allowlist e preparação local; nunca reserva, invoca coletor ou grava remotamente.

Artefatos ignorados e privados: `artifacts/meta-preview-publicacao-20261029/`.
Contêm manifesto de reversão (linha completa anterior, identidade, caminho,
hash, MIME, dimensões, metadados e versão), cópias dos onze objetos, pedidos do
piloto/restantes, resultados do dry run e pacotes atuais de produção Meta v16,
coordenador v11 e entrada v1. Credenciais e sessões não são gravadas.

Reversão: parar novos pedidos pela entrada, comprovar término das operações,
restaurar entrada/coordenador/coletor a partir dos pacotes preservados. Manter
colunas, reservas, recibos e objetos antigos. Reverter código não reverte mídia:
uma restauração autorizada deve adquirir a exclusão, comparar o estado novo
confirmado por hash/caminho/versão (CAS), verificar o objeto antigo e restaurar
atomicamente a referência/metadados. Não excluir objetos ou reutilizar reservas.

Gate pendente: autorização final para aplicar migrations e publicar as três
funções em produção. Depois, executar o piloto pela entrada autenticada e o
coordenador existentes. Nenhuma migration, função ou imagem real foi alterada
em produção por esta segunda entrega.
