/**
 * Servidor FAKE da Telegram Bot API — usado só nos testes automatizados.
 *
 * Implementa o mínimo que o backend usa (getMe, deleteWebhook, setMyCommands,
 * getUpdates com long polling e sendMessage). O teste "digita" mensagens como
 * se fosse o cliente no Telegram (pushText) e inspeciona o que o bot enviou
 * (sent). O backend roda sem nenhuma alteração: só TELEGRAM_API_BASE muda.
 */
import http from 'node:http';

export async function startFakeTelegram({ token, username = 'claro_test_bot' }) {
  const updates = [];
  const sent = [];
  let nextUpdateId = 1;
  let nextMessageId = 1000;
  let waiters = [];

  const notify = () => {
    const current = waiters;
    waiters = [];
    current.forEach((fn) => fn());
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const match = /^\/bot([^/]+)\/(\w+)$/.exec(req.url || '');
      const reply = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (!match || match[1] !== token) {
        return reply(401, { ok: false, error_code: 401, description: 'Unauthorized' });
      }
      const params = raw ? JSON.parse(raw) : {};
      switch (match[2]) {
        case 'getMe':
          return reply(200, { ok: true, result: { id: 1, is_bot: true, first_name: 'Claro Test', username } });
        case 'deleteWebhook':
        case 'setMyCommands':
          return reply(200, { ok: true, result: true });
        case 'getUpdates': {
          const offset = params.offset ?? 0;
          const pending = () => updates.filter((u) => u.update_id >= offset);
          if (pending().length === 0) {
            // long polling: segura a requisição até chegar update ou estourar o timeout
            await new Promise((resolve) => {
              const timer = setTimeout(resolve, Math.min(params.timeout ?? 0, 25) * 1000);
              waiters.push(() => {
                clearTimeout(timer);
                resolve();
              });
              req.on('close', resolve);
            });
          }
          return reply(200, { ok: true, result: pending() });
        }
        case 'sendMessage': {
          const message = { message_id: nextMessageId++, date: Math.floor(Date.now() / 1000), chat: { id: Number(params.chat_id), type: 'private' }, text: params.text };
          sent.push({ chatId: String(params.chat_id), text: params.text });
          return reply(200, { ok: true, result: message });
        }
        default:
          return reply(404, { ok: false, error_code: 404, description: 'Not Found' });
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    sent,
    /** Simula o cliente enviando um texto ao bot. Retorna o update criado. */
    pushText(chatId, text, { chatType = 'private', messageId } = {}) {
      const update = {
        update_id: nextUpdateId++,
        message: {
          message_id: messageId ?? nextMessageId++,
          date: Math.floor(Date.now() / 1000),
          chat: { id: Number(chatId), type: chatType },
          from: { id: Number(chatId), is_bot: false, first_name: 'Cliente' },
          text,
        },
      };
      updates.push(update);
      notify();
      return update;
    },
    /** Mensagens enviadas pelo bot para um chat */
    sentTo(chatId) {
      return sent.filter((m) => m.chatId === String(chatId));
    },
    close() {
      notify();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
