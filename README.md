This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Banco de dados (Neon)

O app usa Postgres no [Neon](https://neon.tech) via `@neondatabase/serverless` (`src/lib/db.ts`), configurado pela variável `DATABASE_URL`.

- Schema completo: `db/schema.sql` (equivale às migrations 001–018 de `supabase/migrations`, que ficam só como histórico).
- O Supabase continua sendo usado apenas como agendador (`pg_cron` + `pg_net` chamando as rotas do app, ver abaixo); ele não guarda mais dados do app.
- Mudanças novas ficam em `db/migrations/` (aditivas, idempotentes), com o rollback de cada uma em `db/rollback/`. Aplique primeiro num branch do Neon e só depois no principal — **antes** de publicar o código que depende delas.

## Calorias pela TACO

A IA só identifica cada alimento e estima as gramas; kcal e macros são calculados pelo app (`kcal = gramas × kcal_100g / 100`, idem macros):

1. **Rótulo** do usuário (`custom_foods`, valores por 100 g, um por nome normalizado e por usuário);
2. **TACO** 4ª edição (`taco_foods`, 591 alimentos, busca aproximada com `pg_trgm`);
3. **Estimado** pela IA, quando não há correspondência — salvo com `needs_review = true`, e o app oferece cadastrar o rótulo.

Cada lançamento guarda `quantity_g`, `source` (`taco` | `rotulo` | `estimado` | `manual`), `taco_food_id`/`custom_food_id` e `needs_review`. Registros anteriores ficam com essas colunas vazias.

**Validação** (`src/lib/nutrition/validation.ts`, função pura usada no servidor, no app e na auditoria), só para itens com kcal > 0 e gramas:

- ERRO (não salva): mais de 9 kcal/g;
- AVISO (salva com `needs_review` e selo "Revisar"): macros informados com `|4·P + 4·C + 9·G − kcal|` acima de 10% das kcal (mín. 2 kcal), ou kcal/100 g mais de 30% fora do alimento correspondente na TACO/rótulo. A regra dos macros não vale para valores calculados pelo app a partir da própria tabela (168 itens da TACO não fecham 4/4/9 por usarem fatores próprios).

**Dados da TACO:** `scripts/taco/build_taco_seed.py` gera `db/migrations/002_taco_foods_seed.sql` e `db/taco/taco_foods.csv` a partir da planilha oficial do NEPA/UNICAMP (o sha256 da planilha fica no cabeçalho do seed). Ficam de fora os 6 itens sem valor de energia na tabela (ex.: "Leite, de vaca, integral", marcado "*"); o nome do item 540 ("Feijoada") vem do PDF oficial, pois a planilha traz só "L".

**Auditoria dos registros antigos** (somente leitura, por usuário): `DATABASE_URL=... npm run audit:food-logs` (`-- --user <id>` para um usuário, `-- --json` para JSON). As gramas vêm do nome quando o app as escreveu lá, e a referência é achada pelo nome — o relatório indica quando foi assim.

## IA (Gemini)

- Modelo: `gemini-3.8-flash` em todas as chamadas (chat, análise de alimentos e treinos, planos, coach). A variável `GEMINI_MODEL` troca sem mudar código — por exemplo `GEMINI_MODEL=gemini-3.5-flash` para voltar ao anterior. Na família 3 o app usa `thinkingLevel` (padrão `low`) e não fixa temperatura; o Groq continua como reserva.
- Chat do Coach (`/api/chat`): responde em streaming (SSE) com um `ping` a cada 8 s. O turno roda até o fim e grava a pergunta e a resposta em `chat_messages` mesmo se o celular derrubar a conexão; o app busca a resposta em `/api/chat/history` quando isso acontece.
- Cada resposta guarda em `chat_messages.meta` o modelo, tokens, rodadas, tempo e o que a ferramenta `log_food` gravou. 👍/👎 (com comentário opcional no 👎) ficam em `rating`/`rating_comment` (`/api/chat/feedback`). Para revisar as negativas:

  ```sql
  SELECT q.content AS pergunta, a.content AS resposta, a.rating_comment, a.meta
    FROM chat_messages a
    JOIN LATERAL (SELECT content FROM chat_messages u
                   WHERE u.conversation_id = a.conversation_id AND u.role = 'user' AND u.created_at <= a.created_at
                   ORDER BY u.created_at DESC LIMIT 1) q ON true
   WHERE a.rating = -1 ORDER BY a.rated_at DESC;
  ```

- Requer a tabela `chat_messages` (final de `db/schema.sql`). Sem ela o chat funciona, mas sem recuperação da resposta nem avaliação.

## Testes

`npm test` roda os testes (sem rede: Gemini simulado) e `npm run typecheck` o TypeScript. O workflow **Qualidade** roda typecheck, lint e testes em todo push/PR.

## Notificações (Telegram)

As notificações são enviadas por um bot do Telegram, com agendamento de hora em hora via Supabase `pg_cron` (só dispara as chamadas HTTP; os dados ficam no Neon).

**O que o usuário recebe** (respeitando categorias e horário silencioso definidos em `/notifications`):

| Quando | Mensagem |
| --- | --- |
| Fim do horário silencioso (padrão 7h) | Bom dia: resumo de ontem, foco do dia e metas |
| 9h–20h, só se abaixo do ritmo | Hidratação (máx. 3/dia, intervalo ≥ 2h30) com botões **+250ml / +500ml** |
| 10h / 14h / 20h | Café, almoço ou jantar não registrado, com saldo de kcal e proteína |
| 18h, após 2+ dias sem treino | Lembrete de treino |
| 1h antes do silencioso (padrão 21h) | Fechamento do dia com metas batidas |

Comandos do bot: `/resumo`, `/agua 300`, `/ajuda`, `/desconectar`.

**Chat limpo:** os comandos do usuário são apagados assim que processados. As mensagens do bot somem ao tocar num botão ou ao expirar: lembretes em 2h, respostas de comandos em 10 min, e resumos quando chega o próximo resumo. A limpeza roda a cada 10 min (`/api/telegram/cleanup`, migration 015).

**Configuração**

1. Crie o bot com o [@BotFather](https://t.me/BotFather) e anote o token e o username.
2. Variáveis de ambiente na Vercel:
   - `TELEGRAM_BOT_TOKEN` — token do BotFather
   - `TELEGRAM_BOT_USERNAME` — username do bot (sem `@`)
   - `TELEGRAM_WEBHOOK_SECRET` — string aleatória (`A-Z a-z 0-9 _ -`, até 256 caracteres)
   - `APP_URL` — URL pública do app, ex.: `https://healthcoach.vercel.app`
   - `CRON_SECRET` — já existente
3. No Supabase (agendador), aplique os jobs de `pg_cron` das migrations `014_telegram_notifications.sql` e `015_telegram_message_cleanup.sql` e cadastre os segredos:
   ```sql
   SELECT vault.create_secret('https://SEU-APP.vercel.app', 'app_url');
   SELECT vault.create_secret('<CRON_SECRET>', 'cron_secret');
   ```
4. Após o deploy, registre o webhook e o menu de comandos:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP.vercel.app/api/telegram/setup
   ```
5. No app, acesse **Perfil → Notificações → Conectar Telegram**.

## Treinos IA

Tela **Corpo → Treinos IA** (`/treinos`). Gera um plano semanal de treino com IA, em casa ou na academia, com séries, repetições, descanso, carga e explicação de execução de cada exercício.

- **Perfil de treino** (salvo uma vez): nível, dias por semana, tempo por treino, equipamentos em casa e lesões/limitações.
- **Plano semanal**: sessões A/B/C… com aquecimento, exercícios e desaquecimento. Gerar um novo plano mantém os anteriores no histórico.
- **Registro do treino**: marca cada série com repetições (ou segundos) e carga; tem timer de descanso e o treino em andamento fica salvo no aparelho. Ao finalizar, o gasto calórico (MET × peso × duração) entra no diário como `🏋️ Musculação`, então dashboard, Coach IA e Telegram passam a contar o treino.
- **Progressão**: dupla progressão — quando todas as séries chegam ao topo da faixa, o app sugere subir a carga. O histórico de cargas também vai para a IA ao gerar o próximo plano.

As tabelas de treino já fazem parte de `db/schema.sql`.
