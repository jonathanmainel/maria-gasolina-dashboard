# Homologacao autenticada da RLS em Supabase isolado — pacote v3

Status em 23/10/2026: homologacao executada e aprovada no projeto separado `uwafdxsdsgqysjjxfywo`, somente com contas e dados sinteticos. Projeto criado com cotacao explicita de US$ 0/mensal na organizacao Free. Producao nao alterada. Ambiente temporario deixado em leitura apos ensaios de congelamento e recuperacao. Ver [relatorio-homologacao.md](./relatorio-homologacao.md).

## Resultado do inventario de ambientes

O inventario inicial tinha somente a producao `hlqrpreqvvxtkruwsolg`. Apos aprovacao e cotacao explicita zero, foi criado o projeto separado Maria Gasolina | RLS Homologacao I05 (`uwafdxsdsgqysjjxfywo`), na organizacao Jonathan GT+, plano Free, regiao us-east-1. Nao foi criada branch de banco nem alterada a assinatura. A producao nunca foi usada para testes, nem com ROLLBACK.

## Opcao recomendada: projeto Supabase exclusivo de homologacao

Um projeto separado fornece Auth e API REST reais, com URL/chaves proprias, sem depender de Docker, psql, commits, pushes ou um deploy do dashboard. E adequado para este teste restrito porque permite reproduzir apenas os objetos necessarios, sem ativar sincronizacoes e integracoes de marketing.

A organizacao, o projeto, a regiao, o custo e a autorizacao de criacao devem ser confirmados antes do provisionamento. Nao presumir gratuidade ou disponibilidade de quota. Nao reaproveitar projeto de outro cliente. O ambiente deve conter somente identidades e registros sinteticos.

Dependencias do DDL-base: definicoes exatas de `dashboard_clients`, `dashboard_client_users`, `dashboard_manual_inputs`, indices/constraints, grants de schemas/tabelas, politica `self_select`, helper privado de associacao e tres politicas manuais atuais. Copiar definicoes auditadas, nao dados, chaves, vault, tokens de midia, cron, webhooks ou Edge Functions. Auth e `auth.uid()` devem ser os reais do Supabase: **nao executar `testes-rls.sql` no Supabase**, pois ele cria um substituto local de Auth para testes complementares.

Conferir equivalencia dos objetos/grants com a producao antes de aplicar o script v3. A homologacao de um esquema aproximado nao basta; se houver divergencia, interromper e corrigir a reproducao em ambiente isolado antes dos testes.

## Alternativa: branch Supabase descartavel

Uma branch possui instancia e credenciais proprias; por padrao nao inclui dados de producao. Criar via Dashboard e possivel sem conectar ou publicar uma branch Git. Nunca habilitar **Include data**. A funcionalidade depende do plano/permissoes e pode ter custo por uso; nao provisionar sem aprovacao do custo.

A branch nao deve ser tratada como clone perfeito do catalogo vivo: sua estrutura depende do historico de migrations e pode divergir de mudancas feitas diretamente no banco. Comparar constraints, grants, schemas privados, funcoes e politicas antes dos testes. Tambem herda configuracoes e Edge Functions; a documentacao informa ativacao de Database Webhooks. Inventariar cron/webhooks/extensoes e impedir chamadas externas no ambiente de homologacao, com alteracoes somente nesse destino e aprovadas. Nao copiar segredos de marketing para faze-lo funcionar.

Essa alternativa reduz a montagem inicial, mas exige mais cuidado com integracoes herdadas e configuracoes. Por isso o projeto separado e a recomendacao para este escopo. Nao executar merge/rebase/reset de branch Supabase nem vincular fluxo automatico de deploy. A futura producao recebera apenas o SQL revisado e aprovado, nunca um merge cego do ambiente de teste.

Fontes oficiais: [branching](https://supabase.com/docs/guides/deployment/branching), [branches pelo Dashboard](https://supabase.com/docs/guides/deployment/branching/dashboard), [custos](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Procedimento reproduzivel sem Docker ou psql (executado no sandbox)

1. Autorizar e provisionar o destino isolado; confirmar project_ref e URL diferentes da producao. Registrar o custo aprovado e prazo de descarte, sem excluir nada automaticamente.
2. Reproduzir o DDL-base auditado. Confirmar ausencia de usuarios/dados reais e de processos que chamem sistemas externos. Exportar o estado inicial de seguranca e verificar sua restauracao nesse ambiente.
3. No SQL Editor do destino isolado, executar `homologacao-bootstrap.sql`: exige tabelas e Auth vazios, cria cliente A sintetico (`id=1`, slug `maria-gasolina`, nome marcador `RLS_SANDBOX_ONLY`) e um registro `business` sentinela. Esta fixture propositalmente antecede o trigger; nao e resultado operacional.
4. Executar `rls-proposta.sql` no mesmo destino, com a transacao integral. Conferir novo CHECK, funcoes, trigger habilitado, politicas e grants. Nenhum vinculo e promovido por esse SQL.
5. Criar cinco contas sinteticas exclusivas no **Auth do destino**, com email/senha e email confirmado. Nao enviar convites para pessoas reais nem utilizar as oito contas atuais. Usar credenciais privadas. Se necessario habilitar login por senha, alterar somente o ambiente isolado; nao alterar o login de producao.
6. Preencher uma copia privada de `homologacao-vinculos.sql` com os cinco UUIDs confirmados em Auth. O script verifica marcador, ausencia de vinculos e cinco contas antes de criar as associacoes de teste. Adiciona cliente B (`id=2`, slug `rls-sandbox-b`). Nao cria registros comerciais por SQL depois do trigger: eles serao criados por sessoes reais na API.
7. Guardar configuracao de execucao fora do repositorio. Rodar o executor REST abaixo com a ref isolada explicitamente permitida. Ele autentica cada conta pelo endpoint Auth, confirma `/auth/v1/user` e usa seu JWT de usuario em chamadas REST. Nenhuma chave `service_role` ou secret e aceita.
8. Executar os cenarios manuais adicionais de revogacao, papel diferente por cliente e adulteracao de metadata, mantendo o mesmo token. Registrar antes/depois sem imprimir tokens.
9. Aplicar `rls-reversao-segura.sql` **somente no ambiente isolado**. Restaurar o papel do editor de teste se tiver sido rebaixado no passo 8 e executar o executor com `--frozen`: deve manter leitura e negar INSERT/UPDATE/DELETE a todos os perfis.
10. Guardar relatorio privado com project_ref, instante, hash do SQL aplicado, casos, codigos HTTP/SQLSTATE e resultados; sem senhas, JWTs ou payloads de clientes. As fixtures permanecem no ambiente descartavel ate autorizacao de descarte. Nao converter testes falhos em aprovados nem reutilizar estes dados em producao.

## Perfis sinteticos

| Conta | Cliente A | Cliente B |
|---|---|---|
| viewer | viewer | sem vinculo |
| editor | editor | sem vinculo |
| admin | admin | sem vinculo |
| other | sem vinculo | admin |
| dual | editor | editor |

Para testar privilegios diferentes do mesmo usuario, alterar apenas o vinculo `dual` em B para viewer, por operador do sandbox, e repetir leitura/escrita com seu JWT anterior. Isso nao deve alterar seu papel editor em A.

As verificacoes sob usuarios comuns provam a autorizacao. Operacoes administrativas de criar fixtures e alterar papeis servem somente de preparacao: **sucesso no SQL Editor nao e resultado de teste RLS**.

## Executor REST autenticado

Arquivo: `testes-rls-rest.mjs`. Requer Node com fetch nativo; nenhuma biblioteca nova. O modo CLI nao possui transporte simulado. Os testes unitarios separados do executor usam mocks e nao homologam o banco.

Configuracao privada (substituir placeholders localmente; nao salvar no Git nem enviar pelo chat):

```json
{
  "projectRef": "<ref do sandbox aprovado>",
  "url": "https://<ref do sandbox aprovado>.supabase.co/",
  "confirmation": "RLS_SANDBOX_ONLY",
  "apiKey": "<publishable ou anon do sandbox>",
  "clientA": 1,
  "clientB": 2,
  "accounts": {
    "viewer": {"email":"<sintetico>","password":"<privada>","userId":"<uuid Auth>"},
    "editor": {"email":"<sintetico>","password":"<privada>","userId":"<uuid Auth>"},
    "admin": {"email":"<sintetico>","password":"<privada>","userId":"<uuid Auth>"},
    "other": {"email":"<sintetico>","password":"<privada>","userId":"<uuid Auth>"},
    "dual": {"email":"<sintetico>","password":"<privada>","userId":"<uuid Auth>"}
  }
}
```

Exemplo PowerShell, depois da aprovacao/provisao do ambiente:

```powershell
$env:RLS_TEST_PROJECT_REF = '<ref do sandbox aprovado>'
node docs/incremento-05/testes-rls-rest.mjs 'C:\caminho-privado-fora-do-repositorio\rls-sandbox.json'
# Depois da reversao aplicada no sandbox e restauracao do perfil de teste:
node docs/incremento-05/testes-rls-rest.mjs 'C:\caminho-privado-fora-do-repositorio\rls-sandbox.json' --frozen
```

Protecoes do executor:

- Recusa explicitamente a ref de producao, mesmo se confirmada por engano, e exige coincidencia entre URL, ref e allowlist de ambiente. Recusa redirect, URL arbitraria, chave privilegiada e arquivo privado dentro do repositorio.
- Verifica identidades distintas pelo Auth e os papeis efetivamente lidos em `dashboard_client_users`; nao trata qualquer conta autenticada como editor.
- Exige clientes com marcador de fixture e estado inicial conhecido; nao executa limpeza automatica para ajustar um ambiente divergente.
- Usa `return=representation` e confere linhas afetadas. UPDATE/DELETE com zero linhas podem representar negacao; POST/upsert nao e aprovado assim.
- Depois de tentativas de escrita negadas, rele as linhas pelos vinculos autorizados do usuario dual e compara o estado inteiro das fixtures. Compara tambem dados de B e metas sentinelas.
- Erro de login, token expirado, erro de sintaxe, falha de rede ou HTTP 5xx nao conta como negacao RLS. Exige 42501 para autorizacao ou 23514 para contrato invalido, nos casos previstos.
- Um DELETE bem-sucedido de admin com retorno de uma linha prova o funcionamento conjunto do GRANT e da policy. Viewer/editor devem permanecer impedidos de excluir a mesma classe de registro.
- Registra nomes de casos e PASS/FAIL sem tokens, emails, senhas ou dados comerciais. Interrompe no primeiro erro. Dados de teste ficam apenas no sandbox.

## Casos manuais autenticados adicionais

Usar cliente REST/Postman ou sessao interativa privada com a chave publica e o JWT obtido por login real. Nao forjar JWT, nao usar service role e nao simular auth.uid() para estes testes.

1. **Revogacao imediata:** capturar sessao editor e salvar seu token apenas em memoria. Operador rebaixa somente seu vinculo A para viewer. Com o mesmo token, GET autorizado continua, PATCH retorna zero/42501 e upsert e negado; reler sentinela inalterada. Restaurar somente a conta sintetica depois.
2. **Editor A/viewer B:** com dual autenticado, mudar seu vinculo B para viewer. GET B deve continuar; PATCH/upsert B nao deve gravar. A continua editavel. O teste anterior de client_id imutavel deve ter sido feito quando havia editor nos dois clientes.
3. **Metadata adulterada:** usuario viewer altera sua `user_metadata.role` para admin pelo endpoint Auth (somente conta sintetica). A escrita em registros e vinculos continua negada. O papel autorizado segue no banco, nao nessa metadata.
4. **DELETE e grants:** conferir catalogo com operador e repetir DELETE via JWT admin, editor e viewer. Catalogo sozinho nao comprova autorizacao. Nao usar DELETE de dados reais como teste.
5. **Trigger:** tentar transferir linha entre clientes, trocar scope, mudar frente no payload sem scope e forjar `updated_by`. As duas primeiras devem falhar, payload incoerente deve ser rejeitado e autoria enviada deve ser substituida por auth.uid(). Conferir trigger habilitado no catalogo apenas como evidencia complementar.
6. **Manager legado:** em uma copia descartavel anterior ao SQL v3, inserir vinculo sintetico manager e confirmar que a transacao aborta antes de trocar o CHECK. Conferir que nenhum usuario foi convertido. Remover/revisar a fixture apenas por operador do sandbox e repetir a proposta. Este ensaio deve preceder a criacao do fixture final; nao executar na producao.
7. **Permissoes por coluna/heranca e TRUNCATE:** complementar pelo catalogo e pela suite SQL, quando houver PostgreSQL isolado disponivel. REST nao oferece TRUNCATE; nao criar RPC privilegiada apenas para testa-lo. Ausencia de endpoint nao substitui revogacao do grant.

## Resultados nesta revisao

- Producao: inventario read-only confirmado, oito viewers, zero registros manuais; nenhuma alteracao.
- Sandbox: RLS aplicada, cinco contas sinteticas, 56 verificacoes SQL de autorizacao e 23 de validacao aprovadas. Teste adicional confirmou que manager legado interrompe o preflight sem conversao; toda a fixture foi revertida.
- Auth + REST reais: 55 casos base, 12 adicionais, 17 no congelamento e seis na recuperacao aprovados; tres requisicoes anonimas adicionais negadas.
- Executor: 18 testes locais com mocks aprovados, separados dos resultados de RLS real.
- Frontend: viewer/editor/admin alinhados em Vendas e Metas; 544 unitarios/componentes, 44 E2E, quatro de empacotamento e TypeScript aprovados; builds locais aprovados.
- Estado final do sandbox: leitura mantida, escrita congelada, dados sinteticos preservados. Producao e os oito usuarios reais permanecem inalterados.

## Aplicacao e reversao em producao — somente apos nova autorizacao

Aprovar evidencias do ambiente isolado e o SQL exato por hash. Fazer backup privado de DDL, politicas, grants, helpers, triggers, CHECK e vinculos/valores existentes; exportacao pelo SQL Editor/Dashboard e uma alternativa ao pg_dump local, desde que a restauracao tenha sido ensaiada no ambiente isolado. O arquivo de backup nao integra Git ou relatorio publico.

Repetir inventario imediatamente antes da aplicacao. Encontrar manager legado, outro cliente sem inventario, trigger novo ou divergencia relevante exige parar, nao converter papeis ou sobrescrever configuracoes. Aplicar a transacao v3 somente apos autorizacao especifica e conferir grants/policies/trigger/contagens depois. Nenhum dos oito viewers e promovido por ela.

Frontend local ja reconhece editor e a edicao de Metas ja usa o mesmo controle de acesso. Manter `COMMERCIAL_ACCESS_POLICY_READY = false` ate homologacao completa e nomeacao explicita dos primeiros editores. Nomeacao por UUID confirmado e filtro exato do cliente, individual e auditada, nunca em massa.

Se houver falha antes do COMMIT, reverter a transacao. Depois do COMMIT, a alternativa segura e o script de congelamento: revoga escrita e aplica politicas restritivas, preservando SELECT, dados, novos papeis e trigger. Ele pode ser repetido e verifica privilegios herdados/por coluna. Ensaiar com `--frozen` antes de aprovar producao. Nao restaurar automaticamente as politicas que davam escrita a viewers, nao excluir registros e nao remover editor do CHECK enquanto houver vinculos nesse papel.

## Evidencias e estado final

Foram executados 55 testes REST base, 12 adicionais, 17 com escrita congelada e seis de recuperacao; todos aprovados. Tres requisicoes anonimas adicionais foram negadas. A versao SQL adaptada teve 56 verificacoes de autorizacao e houve 23 casos de validacao de payload aprovados. Nenhum token/senha foi registrado no repositorio.

A reproducao inicial conferiu 3 tabelas/18 colunas/13 constraints/7 indices/5 politicas/2 funcoes/73 entradas de grants de tabela/253 de coluna. Diferenca conhecida: PostgreSQL producao 17.6.1.166 e sandbox 17.11; usuarios e dados sao sinteticos; integracoes de marketing nao foram copiadas.

O procedimento de recuperacao foi ensaiado somente neste sandbox com `homologacao-reabertura.sql`. Oito registros foram preservados em congelamento e recuperacao. Ao final reaplicou-se o congelamento: SELECT preservado e INSERT/UPDATE/DELETE bloqueados para perfis API. Nao executar reabertura automaticamente nem usar a fixture de homologacao em producao.

O advisor final registrou aviso de protecao de senhas vazadas desabilitada no Auth do sandbox. Nao houve alteracao dessa configuracao; ela nao invalida os testes de RLS com senhas sinteticas aleatorias. Nenhuma credencial real foi reutilizada. Nao interpretar o resultado como auditoria completa de Auth.
