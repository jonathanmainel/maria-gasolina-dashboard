# Retaguarda financeira

## Operação

Em **Marketing → Retaguarda**, Admin e Editor podem escolher **Registrar saldo**, selecionar plataforma e conta, informar a data e o saldo em reais e revisar antes de confirmar. O novo registro começa na data de hoje e independe do período consultado no histórico. O formulário aceita formatos como `1234,56` e `R$ 1.234,56`. A informação financeira é atribuída à sessão autenticada pelo banco. O horário do lançamento manual registra quando o valor foi informado e permanece separado da data operacional selecionada. Datas futuras ficam indisponíveis, considerando `America/Sao_Paulo`.

O histórico mantém uma linha vigente por plataforma, conta e data. **Detalhes do registro** ou **Consultar versões** mostra valores, origem, medição, horário de gravação e identificador do autor. **Corrigir** abre o formulário com a conta, data e valores daquela linha. A confirmação acrescenta uma nova versão ligada à anterior. Se outro operador corrigir a mesma versão antes, o banco rejeita o envio e a interface orienta a revisar o registro mais recente.

Os cards usam o último saldo conhecido até hoje para cada conta ativa, independentemente do filtro global. As correções são resolvidas primeiro: versões substituídas não reaparecem. Um registro de importação com apenas estimativa não vira saldo nem apaga o último saldo conhecido de outra data. O painel mantém medição, origem, referência e aviso de desatualização; isso é uma informação registrada, não uma conferência automática com a plataforma. A cobertura e o nome de cada conta aparecem no painel. O saldo consolidado exige valores de todas as contas ativas na mesma data de referência; datas diferentes permanecem visíveis por conta, sem falso total completo.

Os filtros de data, conta e plataforma do histórico respeitam o filtro global. Contas desativadas continuam no histórico. Uma única consulta paginada, limitada ao cliente pela sessão/RLS e às referências até hoje, alimenta o resumo e o histórico; o intervalo é aplicado ao histórico após resolver versões. A consulta é compartilhada e atualizada a cada minuto, sem nova leitura financeira a cada troca de período. A leitura completa evita uma migration apenas para corrigir o resumo e mantém as cadeias de correção disponíveis. Se o volume crescer significativamente, avaliar uma RPC de leitura para últimos saldos e manter o histórico paginado por período, preservando os mesmos contratos e permissões.

Para a investigação de automação e seus limites, consulte [Saldos das plataformas](retaguarda-saldos-plataformas.md).

O modo demonstração exibe o estado indisponível do financeiro. Viewer e links com `share=1` mantêm a consulta e ocultam as ações de gravação. O parâmetro de compartilhamento configura a interface e as permissões de acesso continuam vinculadas à sessão no banco.

## Modelo e permissões

A migration cria `dashboard_retaguarda_financial_entries` com UUID, cliente, plataforma, conta, data de referência, horário da medição, saldo e estimativa em BRL, origem, autor e horário de gravação. A chave estrangeira composta usa o cadastro de contas existente e garante que a conta pertença ao cliente e à plataforma. A versão anterior precisa pertencer à mesma conta e data. Um registro inicial e um único sucessor por versão impedem bifurcações. Os campos monetários são `numeric` com checagem de intervalo e de centavos, para rejeitar arredondamento implícito, negativos, NaN e infinito. É possível preservar medição ou campo monetário ausente em registros históricos não manuais. O autor manual é o UUID autenticado, mantido para auditoria mesmo se a conta de acesso for removida.

A política de leitura usa o vínculo existente de membro do cliente. A de inclusão consulta a própria associação em `dashboard_client_users` e exige Editor ou Admin. A permissão por coluna deixa `origin`, autor, timestamps e chave externa sob controle do banco no formulário manual. A função de contas expõe apenas campos de identificação de contas de mídia do cliente autorizado. UPDATE, DELETE e TRUNCATE são bloqueados na aplicação e pelo gatilho de imutabilidade. Uma conta com histórico deve ser desativada para preservar seu vínculo.

A chave UUID do envio manual permanece a mesma durante nova tentativa. Se a resposta da primeira gravação se perder, a aplicação procura o lançamento pelo UUID e só confirma o sucesso quando autor e dados coincidirem. Em importações, `source_key` identifica a linha de origem por cliente, plataforma, conta e origem. Uma repetição da mesma chave é barrada pelo banco. Uma correção legítima usa nova chave de origem e aponta para a versão vigente. As APIs futuras podem usar o mesmo contrato com origem `api`. A origem é gerenciada por processo autorizado no servidor.

## Homologação e aplicação

1. Use um Supabase de homologação independente de produção. Confirme as tabelas de clientes e contas, a função de associação e a restrição de papéis. O histórico de migrations do repositório inicia com `manager`, enquanto o esquema atual consultado usa `viewer/editor/admin`. Valide essa diferença contra o contrato de homologação antes de testar Editor. Esta migration não altera os papéis.
2. Aplique a migration somente ao ambiente de homologação selecionado. Rode `supabase test db` com o alvo local confirmado ou use um executor SQL no ambiente descartável para executar `supabase/tests/retaguarda_financial_entries.test.sql`. O teste cria clientes e usuários sintéticos em transação e termina em rollback.
3. Configure a URL e a chave pública de homologação no frontend. Confira com Editor, Viewer, Admin de outro cliente e link compartilhado. Teste o caminho real de login, as permissões pela API, a precisão monetária, o recarregamento após gravação, duas correções concorrentes e a retenção da versão anterior. Rode os testes de interface e o build antes de publicar qualquer código.
4. Para futura aplicação em produção, revise o diff da migration, confirme o alvo, os grants e os vínculos de contas, verifique backup restaurável e obtenha autorização. Aplique primeiro o esquema aprovado, verifique as leituras e só depois libere o frontend. Em caso de incidente, desabilite a escrita ou reverta a interface preservando a tabela e os registros.

O ensaio inicial usou PostgreSQL 17 via PGlite e sessões simuladas no navegador. A [homologação técnica](retaguarda-homologacao.md) detalha a validação posterior com Auth e PostgREST locais e o checklist para publicação.

## Importação do formulário anterior

O layout proposto é [retaguarda-financeiro-modelo.csv](retaguarda-financeiro-modelo.csv), em UTF-8 com ponto e vírgula. É um formato intermediário para a prévia. O arquivo original ainda precisa ser conferido antes de criar qualquer mapeamento.

| Campo | Formato |
| --- | --- |
| cliente | Slug cadastrado. |
| plataforma e conta_id | `meta_ads` ou `google_ads`, com o identificador exato da conta no cadastro do cliente. Trate a conta como texto. |
| data_referencia | Obrigatória em `DD/MM/AAAA` ou `AAAA-MM-DD`. |
| medido_em | ISO 8601 com offset ou UTC, quando houver horário de origem. Ausência vira NULL e é sinalizada no relatório. |
| saldo_brl e estimativa_diaria_brl | Decimal brasileiro com até duas casas decimais. Ausência vira NULL. Pelo menos um valor é necessário. |
| id_origem e corrige_id_origem | ID estável e obrigatório da linha de origem e referência opcional à linha corrigida. Use um namespace estável do formulário. Evite chaves que mudam com o nome do arquivo ou número de linha da exportação. |

### Prévia local

Use o Node 24 do projeto. O comando lê dois arquivos locais, produz JSON na saída padrão e opera sem conexão com o Supabase. A origem das propostas é `import`.

```powershell
node scripts/preview-retaguarda-import.mjs "normalizado.csv" "contexto.json"
```

`contexto.json` contém `accounts` e `entries`. Use uma fotografia somente leitura do mesmo destino que receberia os dados, incluindo contas desativadas com histórico. Mantenha os dois arquivos fora do Git.

- `accounts` contém `client_id` numérico, `client_slug`, `platform` e `account_id` textual. A associação exige os três campos exatos do CSV. Zeros à esquerda e diferenças de plataforma são preservados.
- `entries` contém o histórico completo das contas avaliadas, inclusive predecessoras e versões com origem manual ou API. Inclua `id`, `client_id`, `platform`, `account_id`, `reference_date`, `measured_at`, `available_balance_brl`, `estimated_daily_spend_brl`, `origin`, `source_key` e `previous_id`. Exporte valores monetários do banco como texto decimal com ponto ou `null`. Use `entries: []` apenas quando a ausência de registros no destino estiver confirmada.
- O relatório conta linhas válidas, inválidas, duplicadas, conflitantes e incompletas. Mostra motivos e campos ausentes por linha e datas aceitas por plataforma. Incompletude é um sinal adicional. Uma medição sem horário ou com somente um dos valores ainda pode ser válida. O código de saída é 1 para inválidos ou conflitos, 2 para erro de arquivo ou contexto e 0 para uma prévia sem esses problemas.
- Repetições idênticas da mesma chave ficam como duplicatas. Mudanças sob a mesma chave e propostas concorrentes para a mesma data ou predecessora ficam como conflitos. Uma correção aponta para uma versão importada vigente no contexto ou numa linha anterior aceita do CSV, com nova chave e a mesma conta e data. Correções de registros manuais, associações ambíguas e versões fora de ordem exigem revisão antes de qualquer escrita.

Quando o histórico real estiver disponível, confirme o delimitador, formato de data, significado dos valores, moeda, identificador estável, mapeamento das contas, fuso da medição e forma de registrar revisões. Preserve o arquivo original. Revise a prévia com a equipe e atualize o contexto antes de implementar ou autorizar a carga. Uma futura gravação deve revalidar a versão vigente no banco e usar as restrições da migration para proteger a concorrência.

## Estimativa de gasto e autonomia

- A Retaguarda usa somente o gasto de `dashboard_daily_metrics` por plataforma, conta ativa e dia. A janela fixa vai de sete dias atrás até ontem em `America/Sao_Paulo`, independente do filtro que controla o histórico. A estimativa divide o gasto acumulado por sete quando os sete dias têm gasto válido e confirmado em BRL, coletado após o fechamento do dia. Sem cobertura completa, o painel informa quantos dias são válidos. Zero explícito conta como gasto conhecido.
- Os coletores gravam `extra_metrics.currency_code` com a moeda informada pela plataforma. Google Ads converte `metrics.cost_micros` uma vez para a unidade da conta. Meta usa o gasto do relatório de Insights na moeda da conta. Registros antigos sem esse metadado permanecem indisponíveis para o cálculo até serem reprocessados por uma coleta normal.
- O saldo continua sendo registrado separadamente. As versões anteriores preservam a estimativa manual quando existir. A autonomia divide saldo pelo gasto diário calculado, com saldo medido no dia atual ou no último dia completo e gasto positivo. A plataforma consolida somente contas ativas com os insumos completos e saldos alinhados na mesma data.
- Para publicar, aplique somente `20261117150000_allow_retaguarda_balance_without_manual_estimate.sql`, implante `sync-google-ads` e `sync-meta-ads` e aguarde a coleta dos últimos sete dias completos. Confirme que as duas fontes gravaram o gasto e a moeda antes da validação final da interface. As permissões e o histórico do financeiro são preservados.
