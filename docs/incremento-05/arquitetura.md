# Incremento 05 — contratos comerciais e preparação Elo

## Navegação e modelos

`fronts.ts` continua sendo o registro comercial. Os identificadores `place`, `crm`, `condominium` e `franchise` e as URLs anteriores não mudam. Somente os nomes de exibição passam a Places e Vendas. `CommercialFrontSelector` deriva categorias e opções do registro e só mostra o segundo seletor quando há mais de uma frente.

`crmModels.places` possui oito etapas e `crmModels.expansion`, dez. Cada frente aponta para um desses modelos; os cálculos recebem a frente sem ampliar o tipo de frente publicitária. Implantação é pós-venda; o estoque da coluna Contrato não representa contratos fechados no período. A participação de uma etapa no estoque aberto não é uma taxa de passagem.

## Persistência, referência e origem

`commercial-records.ts` valida envelopes versionados e os separa por cliente, frente e natureza. A tabela existente é reutilizada para leitura; os salvamentos locais estão preparados para editor/admin, mas a liberação operacional permanece bloqueada até aprovação e aplicação da RLS em produção. Não há migração automática. Scopes de snapshot não dependem de data; scopes de resultado contêm início e fim. Resultados só são exibidos para o mesmo intervalo exato: não somamos intervalos sobrepostos, não rateamos, não transportamos resultados para filtros parciais.

Exemplo de contrato (sem dados do cliente):

```json
{"version":1,"origin":"manual","front":"company","kind":"result","period":{"start":"2026-10-01","end":"2026-10-23"},"values":{"contracts_closed":3,"revenue":45000}}
```

Tempos por etapa e ticket de referência são opcionais: vazios permanecem desconhecidos; o ciclo só é apresentado quando todos os tempos comerciais necessários são conhecidos. A ausência de linha gera `null` e `—`, nunca zero. Zero digitado explicitamente é um valor conhecido. A entrada manual começa vazia; o editor pede os campos do registro escolhido e separa snapshot de resultados. Dados legados em `business` ou no armazenamento antigo não alimentam o novo leitor comercial. Não apagamos caches antigos, configurações ou dados de autenticação.

`commercial-data.ts` concentra leitura e salvamento. A gravação revalida a autorização antes de chamar o Supabase e permanece bloqueada na operação até aprovação da RLS. Os testes simulam o transporte e os perfis viewer/editor/admin. Não houve gravação de teste na base real.

`use-dashboard.ts` é a composição compartilhada para Vendas, páginas individuais, Visão Executiva e Apresentação. Os modelos comerciais independem da existência de campanhas. O consolidado executivo existente continua explicitamente limitado a Franquias e Condomínios; não inventamos totais Places ou zeros para frentes ausentes. Exportações por impressão usam a mesma apresentação e origem visível, sem outra fonte comercial.

## Demonstração

A prévia comercial é estado da interface de Vendas e só substitui a apresentação dos dados comerciais. Os exemplos em `commercial-examples.ts` existem para Condomínios e Franquias e não são gravados no Supabase. Empresas, Academias e Hospitais continuam sem exemplos. Ao voltar à operação reaparecem os registros operacionais, sem substituição ou mutação.

O modo global `?demo=1` preserva a experiência demonstrativa. Seu editor salva somente na chave local `mg-sales-demo-v1:maria-gasolina`. Essa chave nunca é lida pela operação. Editar dados em um contexto demonstrativo não cria registros no banco. Os avisos permanecem visíveis inclusive na Apresentação e impressão.

## Apresentação adaptativa

`Presentation.tsx` acompanha o redimensionamento da janela, inclusive ao entrar/sair de fullscreen. `presentation-layout.ts` calcula a quantidade de criativos e etapas comerciais por página conforme largura e altura. A implementação paginada publicada foi preservada; não foi transposta a composição antiga da branch. `presentation.css` aplica os ajustes somente à apresentação, sem modificar a dimensão padrão nas páginas normais.

Valores de KPI usam largura de seu próprio contêiner e permanecem em uma linha; os textos explicativos podem reorganizar. O slide Vendas mostra a frente selecionada e permite alternar por categoria, sem comprimir dois funis longos no mesmo slide. Setas dentro dos seletores não acionam navegação entre slides; nos botões da apresentação, o atalho continua funcionando. Marca e identificação da origem permanecem montadas enquanto o conteúdo de cada slide é trocado.

## Pontos para a futura API Elo — não implementados

1. Obter documentação, autenticação, limites e autorização do fornecedor; não existem endpoints fictícios.
2. Mapear a identidade de cada pipeline Elo para a frente e de cada etapa para o ID estável do modelo. Nunca usar posição ou percentuais no nome como probabilidade.
3. Adaptar snapshots de oportunidades e resultados de período separadamente. Documentar fuso, datas de fechamento, receita reconhecida, cancelamentos e escopo de contratos.
4. Ampliar explicitamente o discriminador de origem para o provedor Elo; o leitor atual aceita somente `manual`. Não rotular importações como entrada manual.
5. Definir política de convivência/substituição entre fonte manual e Elo, sem soma automática e sem sobrescrever registros do cliente silenciosamente.
6. Preservar `CrmSummary`, os modelos, componentes e identificadores das frentes. Atualizar o adaptador de obtenção; a estrutura visual não precisa ser reconstruída.
7. Validar autorização, idempotência, atualização e reconciliação em ambiente de teste antes da produção.

Limitações atuais: escrita operacional intencionalmente bloqueada; gestão de permissões depende da proposta separada; leitura real de Meta/Google/GA4 não foi re-homologada com sessão autenticada neste incremento. Os testes usam fontes simuladas e bloqueiam rede externa.

## Homologação das permissões

Em 23/10/2026, a RLS foi testada com Auth e REST reais em projeto Supabase separado e sintético; produção não foi alterada. `commercial-access.ts` reconhece exatamente viewer/editor/admin. Vendas e Metas compartilham a autorização: viewer consulta; editor/admin só editam quando o gate for liberado. Metas não usa mais sucesso local como fallback para falha de gravação operacional. A prévia e o modo demo continuam isolados do Supabase operacional.

`COMMERCIAL_ACCESS_POLICY_READY` continua falso. Papéis desconhecidos ou legados, inclusive manager, não recebem escrita. Administração de permissões ainda exige operador e nomeação nominal; não existe RPC administrativa nova. Detalhes em `relatorio-homologacao.md`.
