# Atualização intradiária e período de análise

O dashboard abre no mês corrente até hoje, pelo calendário de `America/Sao_Paulo`. O preset **Este mês** avança à meia-noite de Brasília, inclusive com a página aberta. Datas digitadas, seleções no calendário e os demais presets mantêm a seleção aplicada.

A comparação de **Este mês** começa no primeiro dia do mês anterior e termina no mesmo dia do mês, limitada ao último dia válido. O seletor e o dashboard indicam a diferença de duração. Hoje entra nos indicadores e pode ter dados parciais. Os períodos fixos usam os dias imediatamente anteriores, com a mesma duração. O botão de comparação controla os deltas inclusive no modo apresentação. Os indicadores derivados usam os totais do intervalo. O CPL em Tendências também usa o investimento e os leads de cada metade do período. A aba Site envia as quatro datas para a RPC de leitura. A assinatura anterior de três argumentos continua disponível aos outros consumidores.

## Modalidades

| Modalidade | Gatilho | Datas inclusivas em Brasília |
|---|---|---|
| Agendada | Job existente às 01h00 | D−7 a D−1 |
| Manual | Botão para administradores e editores | D−7 a D0 |
| Automática | Entrada, recarga, troca de aba, retorno à janela, virada do dia e a cada 30 min com a página visível | D0 |

A atualização automática passa por `request-dashboard-sync`. O navegador envia a ação e o cliente. A função verifica a sessão com Auth e passa a identidade verificada à RPC restrita ao backend. O banco confere o vínculo ativo, resolve a data e as plataformas e usa a mesma trava e o mesmo índice de reserva da coleta manual, da agendada e dos previews. Um membro autenticado com acesso somente leitura pode pedir essa verificação limitada. As permissões de coleta manual, backfill e edição seguem seus contratos atuais.

A validade é de 30 minutos por fonte, a partir da conclusão de uma coleta de métricas bem-sucedida que incluiu D0. Uma resposta bem-sucedida sem linhas conta como verificação da fonte e preserva as linhas existentes. O painel distingue horário do último sucesso, tentativa mais recente e data efetivamente disponível. Uma coleta de dias completos, um preview ou uma falha não renova a validade de D0. Novas coletas automáticas aguardam das 00h55 às 01h05 para dar prioridade à reserva do job das 01h00.

A fila usa o despacho existente de Vault e pg_net. O worker reaproveita os três coletores com as contas ativas habilitadas para automação. As rotinas de validação e gravação de cada plataforma executam em uma transação para D0. A chave da coleta identifica o snapshot, de modo que uma correção para um valor antigo seja aplicada em uma nova coleta. Meta Ads mantém a rotina de previews no seu fluxo já existente. Após persistência confirmada, o dashboard invalida as consultas da fonte concluída, refaz consultas ativas e mantém filtros e navegação.

Falhas confirmadas têm recuo por fonte de 5, 10, 20, 40 e até 60 minutos, contado desde a última tentativa falha. A coleta manual conserva seu intervalo de cinco minutos. Uma reserva automática ainda sem worker pode ser encerrada com segurança após dez minutos. O cron pode liberar uma reserva nessa condição após cinco minutos para iniciar sua janela agendada. Uma execução já iniciada e inconclusiva mantém a exclusão da fonte. Siga a reconciliação operacional existente e confirme que o coletor parou antes de liberar a reserva, conforme o runbook de sincronização manual. [Runbook](../manual-sync/entrega-e-publicacao.md)

## Homologação

1. Use um projeto Supabase isolado. Configure as identidades de administrador, editor e visualizador, as contas de teste de cada plataforma e os segredos de despacho já usados pelo cron.
2. Aplique a migration `20261127200016_dashboard_intraday_sync_mtd.sql`. Confirme a leitura Site com as duas assinaturas de `get_dashboard_overview` e as permissões de usuário.
3. Publique os três coletores `sync-meta-ads`, `sync-google-ads` e `sync-ga4`, o worker `sync-dashboard-daily` e, por último, `request-dashboard-sync`. Repita o manual e o cron com o automático desativado.
4. Habilite `DASHBOARD_INTRADAY_SYNC_ENABLED=true` no backend de homologação e `VITE_ENABLE_INTRADAY_SYNC=1` no build de homologação. Em modo demonstração o dashboard suprime a chamada. Em ambientes simulados mantenha a integração desligada ou intercepte o acesso ao Supabase, como na suíte Playwright.
5. Acesse com dois membros e em abas distintas. Em `dashboard_automation_runs`, confira uma reserva por fonte elegível, `trigger='intraday'`, `period_mode='today_only'` e datas iguais a D0. Confira ausência de coleta quando a página está oculta, nova verificação ao voltar e os estados de cobertura e falha no painel. Provoque falha em uma fonte de teste, confira que seus dados persistidos continuam legíveis e que as outras atualizam. Verifique também um período fixo e a troca de mês.
6. Confirme com as APIs em homologação se a latência de 90 segundos do worker continua suficiente para as contas cadastradas. O atraso de disponibilização dos dados depende de cada plataforma e pode produzir uma verificação sem novas linhas.

## Publicação e reversão

Depois de aprovada a homologação, aplique a migration, publique as funções na ordem acima com o automático desativado e publique o frontend. Ative o backend primeiro e a variável de build `VITE_ENABLE_INTRADAY_SYNC=1` em seguida. O workflow de GitHub Pages lê essa variável do repositório quando publica o frontend.

Para reverter, desative `DASHBOARD_INTRADAY_SYNC_ENABLED` e gere o frontend com `VITE_ENABLE_INTRADAY_SYNC=0`. Acompanhe as reservas já iniciadas até o estado final antes de republicar as funções anteriores. Para reverter MTD, publique a versão anterior do frontend. Mantenha a migration aditiva durante a reversão operacional para preservar o histórico de auditoria, os dados D0 e as assinaturas de leitura. Ela pode ser revertida funcionalmente com as versões anteriores das funções de reserva, claim, status e finalização após a drenagem. A remoção dos objetos e restrições novos, se necessária, deve ser feita em migration corretiva após definir a retenção dos registros `intraday`.

## Testes

O workflow de PR valida TypeScript, Vitest, a migration no PostgreSQL 17 isolado e Playwright com Auth, leituras e coletas simulados. `npm run test:dashboard-sync:sql` usa um contêiner sem rede, schemas de teste para Auth, Vault e pg_net e migrations reais de leitura e gravação. `npm run test:dashboard-sync:e2e` usa Chromium. A suíte nunca acessa as APIs das plataformas.
