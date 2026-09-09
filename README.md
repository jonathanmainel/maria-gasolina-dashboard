# Dashboard Maria Gasolina

Dashboard privado, em React + Vite + TypeScript, conectado às funções de leitura protegidas do Supabase.

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. No Supabase, abra **Project Settings > API Keys** e copie uma chave do tipo **Publishable key** para `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Em **Authentication > Providers > Google**, configure o Client ID e o Client Secret do Google.
4. Cadastre no Google a origem do frontend e a callback exibida pelo Supabase.
5. Após o primeiro login, vincule o usuário ao cliente na tabela `dashboard_client_users`.

Nunca use uma chave `service_role`, `secret` ou `sb_secret_` no frontend. Chaves desse tipo devem ser revogadas imediatamente se forem expostas.

## Comandos

- `npm run dev`: inicia a prévia local.
- `npm run typecheck`: valida o TypeScript.
- `npm run test`: executa testes unitários.
- `npm run test:e2e`: valida os fluxos no navegador.
- `npm run build`: gera a versão de produção.

Durante o desenvolvimento, `/dashboard/maria-gasolina?demo=1` abre dados demonstrativos. Esse atalho é removido automaticamente na versão de produção.
