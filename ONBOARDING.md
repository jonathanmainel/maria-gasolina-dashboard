# Primeiros passos — time de desenvolvimento

Guia rápido para quem está entrando agora no projeto.

## 1. Aceitar o convite e acessar o repositório

Você recebeu um convite por e-mail do GitHub para
`dionatagt/maria-gasolina-dashboard` (privado). Aceite o convite e confirme
que consegue abrir o repositório antes de seguir.

## 2. Clonar e instalar

```bash
git clone https://github.com/dionatagt/maria-gasolina-dashboard.git
cd maria-gasolina-dashboard
npm install
```

Requer Node 20 ou mais recente.

## 3. Ver o sistema completo sem precisar de backend

```bash
npm run dev
```

Abra **http://localhost:5173/dashboard/maria-gasolina?demo=1** — essa URL
carrega a interface inteira com dados de demonstração (fictícios, mas
realistas). É assim que dá para ver todas as telas, os gráficos, o modo
apresentação e a área de CRM funcionando de ponta a ponta sem precisar de
nenhuma credencial configurada.

## 4. Se orientar no projeto antes de mexer

Nesta ordem:

1. **`HANDOFF.md`** — o que já está pronto e, principalmente, o que falta
   fazer para os dados pararem de ser fictícios. Comece por aqui.
2. **`AGENTS.md`** — decisões de produto e de direção visual já tomadas
   com o cliente (GT+/Maria Gasolina). Não mudar navegação, paleta ou
   métricas-chave sem alinhar antes — foi tudo definido com o cliente.
3. **`README.md`** — configuração das variáveis de ambiente e comandos do
   projeto.
4. **`src/types.ts`** — o "contrato" de dados que toda a interface espera.
   Qualquer integração nova (Supabase, Meta Graph API, CRM Elo) deve
   devolver dados nesse formato.

## 5. Conectar dados reais (quando for a vez de cada integração)

1. Copie `.env.example` para `.env.local` e preencha com as credenciais do
   projeto Supabase (peça o acesso ao Dionata/GT+).
2. As funções que buscam dados estão todas centralizadas em
   `src/lib/api.ts` — cada uma já tem a assinatura e o formato de retorno
   esperado; hoje elas leem de `src/data/demo.ts` quando `?demo=1` está na
   URL, e devem passar a chamar as RPCs reais do Supabase.
3. As pendências específicas (o que falta em cada frente: mídia paga,
   orgânico, CRM) estão detalhadas no `HANDOFF.md`.

## 6. Fluxo de trabalho

```bash
git checkout -b feat/nome-da-tarefa
# ... alterações ...
npm run typecheck
npm test
git commit -m "feat: descrição da mudança"
git push origin feat/nome-da-tarefa
```

Depois abra um Pull Request para `main` no GitHub. Não commitar direto em
`main`. Antes de abrir o PR, rode também `npm run build` para garantir que
o build de produção não quebrou.

## 7. Dúvidas de produto/escopo

Qualquer dúvida sobre o que o cliente pediu, prioridade ou prazo, alinhar
com o Dionata (GT+) antes de decidir sozinho — o histórico completo do
briefing está fora deste repositório.
