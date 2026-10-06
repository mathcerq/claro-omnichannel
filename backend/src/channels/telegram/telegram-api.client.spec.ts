import { ConfigService } from '@nestjs/config';
import { TelegramApiClient, TelegramApiError } from './telegram-api.client';

const TOKEN = '123456:FAKE-token-para-teste';

function client(env: Record<string, string> = {}) {
  return new TelegramApiClient(new ConfigService({ TELEGRAM_BOT_TOKEN: TOKEN, ...env }));
}

describe('TelegramApiClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fica desligado sem token', () => {
    expect(new TelegramApiClient(new ConfigService({})).isConfigured).toBe(false);
  });

  it('nunca expõe o token em erros de rede', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new TypeError(`fetch failed: https://api.telegram.org/bot${TOKEN}/getMe`),
    );
    const error = await client().getMe().catch((e) => e);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).toContain('***');
  });

  it('nunca expõe o token em erros da API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ ok: false, error_code: 401, description: `token ${TOKEN} inválido` }),
    });
    const error = await client().getMe().catch((e) => e);
    expect(error.code).toBe(401);
    expect(error.message).not.toContain(TOKEN);
  });

  it('envia texto puro (sem parse_mode) e limita a 4096 caracteres', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    });
    global.fetch = fetchMock;
    await client({ TELEGRAM_API_BASE: 'http://fake.local/' }).sendMessage(42, 'x'.repeat(5000));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://fake.local/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(init.body);
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).toHaveLength(4096);
  });
});
