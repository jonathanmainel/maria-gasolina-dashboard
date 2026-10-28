# Homologação integrada — somente projeto isolado

Destino fixo: `uwafdxsdsgqysjjxfywo`. Estes arquivos nunca são entradas de produção.

Auth, autorização, REST, PostgreSQL, pg_net, Edge Functions, ingestão e frontend são reais. Somente OAuth/provedores de marketing recebem respostas controladas no adaptador `transport.ts`. O adaptador bloqueia qualquer destino de rede diferente do Supabase isolado e dos provedores substituídos. As contas numéricas são sintéticas. Não comprova autorização ou disponibilidade das APIs externas reais.

`package.mjs` prepara em memória os cinco pacotes para revisão/deploy autorizado; não publica nada. A configuração dos provedores é redirecionada somente no pacote de teste para uma tabela em memória, pois o Edge Runtime hospedado não permite `Deno.env.set`. O SDK Supabase continua lendo seu ambiente backend real. Remove apenas o import de declaração de tipos do runtime, sem lógica executável; o serviço remoto de empacotamento estava com timeout ao buscar esse arquivo no JSR. As consultas, normalização, guards e chamadas de persistência dos coletores são preservadas. O código-fonte das entradas de produção não importa este diretório.

O adaptador gera uma chave RSA sintética sem acesso a nenhum projeto Google, somente em memória, para exercitar a assinatura e o parsing locais. Nenhuma credencial de marketing real é configurada. O frontend recebe exclusivamente a URL/chave pública do projeto isolado e a sessão normal do usuário.

Pré-requisitos já preparados sob autorização: schema de marketing baseado nas definições versionadas, RLS dos objetos novos, migration do PR #8, pg_net, Vault com URL e chave backend próprias do ambiente isolado, tabela de cenário e recibos. Nenhum cron novo. As três tabelas, usuários e papéis da homologação I05 foram preservados. O bootstrap e os recibos completos ficam nos artefatos locais; não executar todas as migrations históricas no ambiente I05 e não copiar secrets de produção.

Defina `HOMOLOG_AUTH_FILE` para o arquivo JSON privado preexistente contendo `projectRef`, `url`, `apiKey` pública e `accounts` com os usuários de teste existentes. Não colocar esse arquivo no repositório. Os scripts validam o projeto antes de agir; sessões e chaves backend não são registradas.

Com frontend local na porta 5190 ligado exclusivamente ao projeto isolado:

```text
node tests/homolog/package.mjs
python tests/homolog/stage_control.py preflight
node tests/homolog/integrated.playwright.mjs partial
python tests/homolog/stage_control.py indeterminate
python tests/homolog/stage_control.py preservation
python tests/homolog/stage_control.py scenario success 2
node tests/homolog/integrated.playwright.mjs success
node tests/homolog/security.mjs
```

Esses são testes com escrita sintética no ambiente isolado, não comandos de diagnóstico de produção. `partial` pressupõe cenário partial/generation 1 e o teste success pressupõe success/generation 2. Respeitar cinco minutos reais entre solicitações manuais e verificar ausência de trabalhos ativos antes de alterar cenário. O teste de preservação depende dos sete dias completos já persistidos pelo teste indeterminado. O script Python pode obter somente a chave backend própria do projeto isolado, pela sessão CLI autenticada, para operações de teste autorizadas. A configuração inicial do dispatcher já foi concluída e sua RPC transitória foi removida; não repetir a configuração.

O teste indeterminado mantém o coletor nativo trabalhando em background enquanto devolve uma resposta inconclusiva ao coordenador. Um recibo separado registra a conclusão real do coletor. A reconciliação exclusiva da homologação só altera a linha exata se o recibo já for terminal e o operador for admin do cliente. Uma tentativa antes disso retorna false. Não transportar essa RPC/recibo de teste para produção como desbloqueio automático.

Resultados seguros, capturas e logs locais: `artifacts/homolog-integrada-20261027/` (ignorado no Git). Relatório versionado: `docs/manual-sync/homologacao-integrada.md`.
