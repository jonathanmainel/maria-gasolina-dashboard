# Google Ads — plano de recuperação de 28/09 a 26/10/2026

**Preparado, não executado. Exige autorização específica de ingestão.** Supabase `hlqrpreqvvxtkruwsolg`, cliente `maria-gasolina`, fonte `google_ads`, conta única `6072699813`. Não chamar o coordenador ou outras integrações.

Consulta de leitura em 27/10 confirmou última data 27/09 e zero linhas de 28/09 a 26/10 nos sete domínios: diário, campanhas, grupos de anúncios, anúncios, palavras-chave, grupos de recursos PMax e recursos PMax. São **29 dias completos**. O plano antigo do PR #7 não é dependência.

## Antes da autorização de execução

1. Publicar e validar a Service Account com escrita bloqueada, sob autorização própria. Confirmar testes reais no runtime publicado.
2. Reconsultar cobertura de todos os domínios para detectar dias preenchidos pelo cron; revisar o manifesto e registrar seu hash antes da aprovação. Não inferir ausência de um domínio só pela tabela diária.
3. Executar dry runs por dia, sem escrita, revisando contagens e totais por conta/domínio. Os testes de 27/09 e 25/10 não equivalem à validação dos 29 dias.
4. Conferir limite Explorer e consumo atual. Até oito consultas GAQL por dia, incluindo metadados PMax: cerca de 232 consultas por passagem de 29 dias, além das verificações e possíveis renovações em 401. Esse cálculo não comprova quota disponível.
5. Obter autorização específica para habilitar escrita e executar o manifesto revisado. Não inserir por SQL, truncar, excluir ou alterar schema.

## Ordem proposta

Uma chamada direta por dia, sequencial. Os agrupamentos são pontos de conferência, não pedidos semanais:

| Conferência | Dias individuais | Quantidade |
|---|---|---:|
| 1 | 28/09–04/10 | 7 |
| 2 | 05/10–11/10 | 7 |
| 3 | 12/10–18/10 | 7 |
| 4 | 19/10–25/10 | 7 |
| 5 | 26/10 | 1 |

Corpo por dia: `client_slug=maria-gasolina`, `start_date=end_date=dia aprovado`, `dry_run=false`. Preservar os controles existentes; não habilitar permissões manuais comerciais. Autenticação somente em header backend, nunca no corpo ou relatório.

## Idempotência e parada

Usar as RPCs existentes. Chaves determinísticas incluem domínio, cliente, conta, intervalo e hash do payload normalizado. Repetição idêntica retorna `already_processed`; dados corrigidos pelo Google podem gerar hash novo e upsert nas mesmas chaves naturais. Não somar os totais entre níveis de relatório, que representam visões da mesma atividade.

Após cada dia, guardar somente recibo sanitizado, contagens, totais e status por domínio. Conferir cobertura, duplicação e métricas persistidas. PMax pode retornar vazio válido; distinguir vazio de erro ou domínio não consultado.

Parar no primeiro erro, resposta desconhecida, timeout ou sucesso parcial. RPCs de diferentes domínios não são uma transação única: pode haver gravação parcial. Ler o estado remoto antes de decidir nova tentativa, sem repetição automática. Solicitar autorização para a retomada proposta, identificando dias/domínios já gravados.

Ao concluir, reconciliar os sete domínios e os 29 dias, confirmar ausência de duplicatas e execução diária posterior bem-sucedida. Conservar 27/09 como comparação, sem regravar esse dia fora do intervalo aprovado. Meta, GA4, RLS e dashboard publicado ficam fora do plano.
