# CLAUDE.md — Claro Omnichannel (PoC FIAP × Claro)

Contexto para retomar o projeto rapidamente. O README tem a documentação completa para usuários e banca.

## O que é

PoC acadêmica: unificar canais de atendimento para que o histórico não se perca ao trocar de canal. Um **protocolo** (`CLR-AAAA-NNNNN`) tem uma **timeline única**. Cada mensagem guarda seu canal.

- **WebChat** (app do cliente, PWA): real
- **Telegram** (bot `@claro_omnichannel_mathcerq_bot`): real, long polling
- **Telefone**: **mock assumido** (dados inventados, sem telefonia). Decisão do autor, não é pendência
- WhatsApp foi substituído pelo Telegram (a API do WhatsApp Business exige verificação da Meta). Valores `WHATSAPP`/`EMAIL` só existem como legado na exibição

## Comandos (raiz)

```bash
npm run setup              # instala tudo, migra e popula o SQLite (precisa de backend/.env)
npm run dev                # API :3000 + painel :5173 + app cliente :5174
npm run db:reset           # recria o banco + seed
npm test                   # unit (Jest) + e2e Telegram + e2e UI — não precisa de servidores rodando
npm run test:unit          # backend: jest
npm run test:e2e:telegram  # backend isolado :3100 + Bot API fake
npm run test:e2e:ui        # Playwright/Chrome: backend :3200 + vite :5273/:5274
npm run test:e2e:2fa       # exige `npm run dev` rodando (usa o dev.db)
```

Backend isolado: `cd backend && npm run build && npm start` (gera `dist/main.js`; `tsconfig.build.json` exclui `prisma/`).

## Ambiente

- `backend/.env` (NUNCA versionar; `.gitignore` cobre `.env` e `.env.*` em qualquer pasta). Modelo em `backend/.env.example`.
- Obrigatórias (a API não sobe sem elas): `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (diferentes), `TOTP_ENCRYPTION_KEY`.
- `TELEGRAM_BOT_TOKEN` vazio desliga o Telegram. `TELEGRAM_API_BASE` só é usado nos testes (Bot API fake). `CLIENT_APP_URL` aparece nas mensagens do bot.
- **Nunca** escreva o token do bot em código, README, testes, logs ou commits. Os testes usam token fake.
- Frontends: `VITE_API_URL` (padrão `http://localhost:3000`).
- Windows: com a API rodando, `prisma generate` falha (DLL travada). Pare o node antes. `prisma migrate dev` não roda em shell não interativo: gere a migração com `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<nome>/migration.sql` e aplique com `prisma migrate deploy`.

## Arquitetura (backend NestJS, `backend/src`)

- **Núcleo**: `protocols/` (protocolo único, `protocol-access.ts` = regra de acesso) e `messages/` (timeline). Eles **só publicam** eventos de domínio (`events/domain-events.ts`, `@nestjs/event-emitter`).
- **Assinantes**: `gateway/events.gateway.ts` (Socket.io) e `channels/channel-dispatcher.service.ts` (entrega de saída → `Message.deliveryStatus`).
- **Canais** (`channels/`): contrato `ChannelAdapter` + `ChannelRegistry`. Adapters: `webchat/` (real), `telegram/` (real), `phone-mock/` (mock). Novo canal = novo módulo que registra seu adapter e chama `MessagesService.createInbound()`. O núcleo não muda.
- **Entrada externa idempotente**: `@@unique([channel, externalId])` em `Message` (Telegram: `"<chatId>:<messageId>"`).
- **Telegram** (`channels/telegram/`): `telegram-api.client.ts` (fetch, oculta o token em erros), `telegram-polling.service.ts` (getUpdates, backoff, 409), `telegram-bot.service.ts` (comandos e texto livre → cria/reaproveita protocolo), `telegram-link.service.ts` (código de vínculo, hash SHA-256, 10 min, uso único, 5 tentativas), `telegram.adapter.ts` (entrega + avisos de atribuição/encerramento), `telegram.controller.ts` (endpoints do cliente).
- Guards globais: `ThrottlerGuard → JwtAuthGuard → RolesGuard`. `@Public()` libera a rota; `@Roles(...)` restringe.
- `config/load-env.ts` é o **primeiro import** do `main.ts` (decorators leem `process.env` na importação).

## Frontends

- `frontend-agent/` (painel, dark): `ChatPanel` com seletor de canal (padrão = último canal real do cliente; Telegram só se `availableChannels` incluir), card "Canais do cliente" + botão de ligação simulada, indicador real/mock no dashboard.
- `frontend-client/` (PWA): envia sempre como WebChat (o servidor força), tela `/telegram` (código, deep link, QR, desvínculo), "Baixar meus dados" em `/security`.
- Ambos: `api/axios.ts` renova o JWT via refresh token; `api/socket.ts` lê o token a cada (re)conexão. Listeners de socket usam handlers nomeados (`socket.off(evento, handler)`) e reentram na sala no `connect`.

## Decisões e regras

- Vínculo do Telegram por **código gerado com o cliente logado** (não por e-mail: e-mail permitiria se passar por outro cliente).
- Cliente via REST é sempre `WEBCHAT`: não pode forjar origem.
- AGENT só acessa protocolos da fila (sem atendente) ou atribuídos a ele; SUPERVISOR/ADMIN veem todos. A mesma regra vale no `join_protocol` do WebSocket.
- Eventos WebSocket nunca são enviados em broadcast global (salas `user:{id}`, `staff`, `protocol:{id}`).
- Cadastro público sempre cria CLIENT. 2FA obrigatório para staff; TOTP com anti-replay (`User.totpLastUsedStep`).
- Logs não registram conteúdo de mensagens nem o token do bot.
- Resposta do atendente vai ao Telegram **somente** se o canal escolhido for TELEGRAM.
- Mensagem livre no Telegram: protocolo ativo → senão o aberto mais recente → senão cria um. Protocolo encerrado nunca é reaberto pelo bot.
- Seed idempotente (pode rodar várias vezes).

## Convenções

- Código e mensagens em pt-BR; commits pequenos em português (`feat(...)`, `fix(...)`, `test(...)`, `docs`, `chore`). **Não fazer push** sem pedido.
- Validação por DTO (`class-validator`); `ValidationPipe` com `whitelist` + `forbidNonWhitelisted`, então campo extra no body gera 400.
- `strictNullChecks: false` no backend: uniões discriminadas não estreitam. Prefira interfaces com campos opcionais.
- Testes e2e reutilizam `tests/helpers.mjs` (`startTestBackend`, `setupStaff2FA`, `loginStaff`, `connectSocket`). O login tem limite de 10/min por IP: cuidado ao adicionar logins no e2e do Telegram (já usa ~9).

## Pendências sugeridas

PostgreSQL; webhook + Redis adapter para escalar; revogação/rotação de refresh token; adapter real de telefonia ou WhatsApp; retenção/anonimização (LGPD); CSAT ao encerrar; anexos; paginação; tela de administração de usuários; códigos de recuperação do 2FA; CI (GitHub Actions rodando `npm test`).
