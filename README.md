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

## Notificações (Telegram)

As notificações são enviadas por um bot do Telegram, com agendamento de hora em hora via Supabase `pg_cron`.

**O que o usuário recebe** (respeitando categorias e horário silencioso definidos em `/notifications`):

| Quando | Mensagem |
| --- | --- |
| Fim do horário silencioso (padrão 7h) | Bom dia: resumo de ontem, foco do dia e metas |
| 9h–20h, só se abaixo do ritmo | Hidratação (máx. 3/dia, intervalo ≥ 2h30) com botões **+250ml / +500ml** |
| 10h / 14h / 20h | Café, almoço ou jantar não registrado, com saldo de kcal e proteína |
| 18h, após 2+ dias sem treino | Lembrete de treino |
| Quando gerado | Novo insight da IA (uma vez) |
| 1h antes do silencioso (padrão 21h) | Fechamento do dia com metas batidas |

Comandos do bot: `/resumo`, `/agua 300`, `/ajuda`, `/desconectar`.

**Configuração**

1. Crie o bot com o [@BotFather](https://t.me/BotFather) e anote o token e o username.
2. Variáveis de ambiente na Vercel:
   - `TELEGRAM_BOT_TOKEN` — token do BotFather
   - `TELEGRAM_BOT_USERNAME` — username do bot (sem `@`)
   - `TELEGRAM_WEBHOOK_SECRET` — string aleatória (`A-Z a-z 0-9 _ -`, até 256 caracteres)
   - `APP_URL` — URL pública do app, ex.: `https://healthcoach.vercel.app`
   - `CRON_SECRET` — já existente
3. Aplique a migration `supabase/migrations/014_telegram_notifications.sql` e cadastre os segredos do agendador:
   ```sql
   SELECT vault.create_secret('https://SEU-APP.vercel.app', 'app_url');
   SELECT vault.create_secret('<CRON_SECRET>', 'cron_secret');
   ```
4. Após o deploy, registre o webhook e o menu de comandos:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP.vercel.app/api/telegram/setup
   ```
5. No app, acesse **Perfil → Notificações → Conectar Telegram**.
