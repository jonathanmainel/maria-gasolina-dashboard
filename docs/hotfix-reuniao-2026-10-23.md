# Hotfix da reunião — 23/10/2026

Branch independente: codex/hotfix-reuniao-20261023. Base conferida por fetch: main 7c56467691fbd22f99a1fdf8ecb729b9ef6b55d5. Não incorpora os trabalhos locais dos incrementos 05, 06 ou 07. Nenhuma mudança de backend, workflow, RLS, credencial, funil ou dado manual.

## Entrega

- Visão Executiva recebe Recarregar dados, com loading e bloqueio de cliques duplicados. Invalida caches de mídia, detalhamento, Site/GA4, datas de ingestão e assinaturas temporárias das imagens. Aguarda as consultas; falhas são apresentadas, sem sucesso simulado. Não chama Edge Functions ou APIs de coleta.
- Mostra por plataforma o último sucesso de ingestão e a última data realmente persistida. Cobertura anterior ao fim do filtro é sinalizada, sem chamar Google antigo de atualizado. No demo, datas reais ficam indisponíveis e a origem ilustrativa permanece identificada.
- Cards preservam proporção natural e imagem completa; vídeos recebem composição vertical antes de carregar. Remove escurecimento sobre a imagem. Modal usa a área disponível sem se limitar ao tamanho natural pequeno; mantém Escape/foco/fechar, informa baixa resolução e erro de carregamento. Leads, CPL e CTR/Hook não mudam.
- Sparkline vazio não gera path SVG inválido. A ausência de dados continua ausente; não se cria série ou métrica.

## Fontes reais verificadas somente por leitura

| Fonte | Dados persistidos até | Verificação de 22/10 |
|---|---|---|
| Meta Ads | 22/10/2026 | R$ 170,73 e 21 conversões; sete linhas de campanhas |
| GA4 | 22/10/2026 | 59 sessões e 51 usuários ativos |
| Google Ads | 27/09/2026 | Nenhum registro novo de campanhas/daily até 22/10 |

Meta e GA4 têm sincronizações bem-sucedidas em 23/10 para intervalo terminado em 22/10. Não foram repetidas. O filtro inicial do código termina ontem; as consultas de campanhas e anúncios usam seu fim, incluindo 22/10. Para Meta, o recorte de ontem corresponde a R$ 53,05/13 conversões em Condomínios e R$ 117,68/8 em Franquias, sem mudar classificação. GA4 é lido na aba Site pelo contrato existente.

Limite: a inspeção autenticada da UI de produção não pôde ser concluída porque a conexão Chrome deixou de estar disponível. A verificação de registros reais por SQL e do fluxo de leitura no código não é apresentada como teste autenticado da interface. E2E usa API/Auth sintéticos, rede externa bloqueada, e não homologa autorização de produção ou RLS.

## Google Ads — diagnóstico e ação necessária

Código da função publicada e logs de 23/10 confirmam HTTP 502 no catch de exchangeGoogleOAuthToken, antes de fetchGoogleAdsAccountData. A troca é POST para oauth2.googleapis.com/token com as credenciais já configuradas. Campos obrigatórios ausentes teriam outro erro; isso não prova que os valores configurados sejam válidos.

O detalhe OAuth original não foi preservado no histórico consultável. Não há evidência suficiente para escolher entre invalid_grant, invalid_client ou falha de transporte; não houve correção por suposição, leitura/exposição de secrets ou mudança de autorização.

Próximo passo controlado: operador autorizado capturar somente código e descrição sanitizada de uma chamada ao coletor existente com dry_run=true, sem chamar o coordenador geral. Nenhuma chamada administrativa foi feita nesta entrega, pois seu transporte por pg_net gravaria registros de requisição e exige aprovação de produção.

Se invalid_grant for confirmado: conferir no Google Cloud o mesmo OAuth Client, Audience/Testing e conta autorizada; após autorização específica, obter novo consentimento offline para o escopo adwords e substituir somente GOOGLE_ADS_REFRESH_TOKEN no Supabase. Se invalid_client, conferir correspondência do client ID/secret antes de qualquer rotação. Não enviar tokens pelo chat. Testing pode gerar refresh token com sete dias de validade, mas é hipótese aqui, não causa confirmada. Fonte oficial: https://developers.google.com/identity/protocols/oauth2/#expiration.

Sem autenticação restaurada, nenhum backfill foi executado ou apresentado como validado. Depois da recuperação, comparar primeiro o dry-run por dia/conta/domínio de 28/09 a 22/10 com o banco e só autorizar ingestão idempotente após reconciliação.

## Miniatura do anúncio informado

A metadata real usa creative.thumbnail_url e video_thumbnail_fallback. A API oficial Meta retornou esse criativo com thumbnail p64x64. A consulta do vídeo pelo ID no acesso conectado retornou unresolved_video_ids; não foi possível obter vídeo original ou imagem maior por esse acesso. A consulta não comprova inexistência de alternativas por outro nível de permissão. Não alteramos URLs privadas, bucket, políticas ou objetos armazenados; não foi extraído frame nem fabricada resolução.

A melhoria entregue é de dimensionamento, proporção e leitura visual. Não recupera detalhes perdidos da imagem 64x64 e não deve ser anunciada como aumento de resolução. Uma atualização dos objetos privados depende de fonte melhor e autorização específica de escrita em produção.

## Validação e revisão

Comandos: npm run typecheck; vitest dos componentes/lib de recarga, previews, modal, ranking, FrontView, origem e Sparkline; npm run build; npx playwright test --config playwright.hotfix.config.ts.

A configuração E2E dedicada compila um preview com URL/chave inteiramente sintéticas e intercepta as requisições. Nenhum JWT sintético é aceito em produção ou enviado para ela. Testes ficam em tests/hotfix-ui.spec.ts para não depender desse ambiente nas suítes legadas. Screenshots e logs ficam somente em artifacts/hotfix-reuniao, fora do staging.

A rodada inicial encontrou uma expectativa de formatação CSS no teste (0.5625 versus 0.5625 / 1), corrigida semanticamente; também revelou o SVG de série vazia, corrigido na aplicação. Um servidor dev com dependências compartilhadas teve restrição de filesystem para fontes; o E2E passou a usar o build estático. Timeouts ocasionais sob carga foram investigados sem ignorar erros de console.

O deploy existente só dispara por push na main ou acionamento manual. Push desta branch não publica. Antes de merge, conferir novamente a main e executar validação autenticada rápida das datas/KPIs e do acesso aos previews reais. Publicação e qualquer escrita de produção dependem de autorização separada.

## Resultado final antes do PR

TypeScript aprovado; 52 testes relevantes em nove arquivos aprovados; quatro E2E desktop/mobile aprovados sem erros de console/runtime; build de produção final aprovado. A suíte completa não foi repetida integralmente após os últimos ajustes; não se atribuem ao hotfix os números de homologação do Incremento 05. O build mantém o aviso anterior de chunks acima de 500 kB.

Capturas finais em artifacts/hotfix-reuniao/e2e; exemplos sintéticos identificados. Relatório, código e testes somam 18 arquivos no PR. Nenhum arquivo Supabase, auth, API, métrica, fonte de dados real ou workflow foi modificado. As condições de aplicação/publicação permanecem separadas.
