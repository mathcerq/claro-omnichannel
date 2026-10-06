/**
 * Teste E2E do canal Telegram (sem depender do Telegram real).
 *
 * Sobe um servidor FAKE da Bot API e uma instância isolada do backend
 * (porta 3100, banco prisma/e2e.db) apontando para ele. Todo o resto é real:
 * long polling, Prisma/SQLite, REST, guards, WebSocket.
 *
 * Valida: vínculo por código, abertura/reaproveitamento de protocolo,
 * mesma timeline entre Telegram e WebChat, resposta do atendente chegando
 * ao Telegram, mensagens do Telegram chegando ao painel via WebSocket,
 * idempotência, telefone mock e regras de segurança/LGPD.
 *
 * Uso: npm run test:e2e:telegram   (na raiz; não precisa de servidores rodando)
 */
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { io } from 'socket.io-client';
import { startFakeTelegram } from './fake-telegram-server.mjs';

const require = createRequire(import.meta.url);
const { authenticator } = require('otplib');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'backend');
const PORT = 3100;
const API = `http://localhost:${PORT}`;
const FAKE_TOKEN = `e2e-${randomBytes(8).toString('hex')}`;
const CHAT_ID = '777000111';
const PASSWORD = 'Claro@2024';

// ── utilitários ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 8000, interval = 100, label = 'condição' } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (err) {
      last = err;
    }
    await sleep(interval);
  }
  throw new Error(`Timeout esperando ${label}${last instanceof Error ? `: ${last.message}` : ''}`);
}

async function api(method, url, { token, body } = {}) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let passed = 0;
async function step(name, fn) {
  process.stdout.write(`  • ${name} ... `);
  await fn();
  passed++;
  console.log('✅');
}

async function loginClient(email) {
  const { data } = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.ok(data.accessToken, `login de ${email} falhou`);
  return data.accessToken;
}

/** Atendente: configura o 2FA obrigatório (se necessário) e faz login com TOTP. */
async function loginStaff(email) {
  let { data } = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  let secret;
  if (data.requiresTotpSetup) {
    const setup = await api('GET', '/auth/totp/setup', { token: data.setupToken });
    secret = setup.data.secret;
    await api('POST', '/auth/totp/enable', { token: data.setupToken, body: { code: authenticator.generate(secret) } });
    ({ data } = await api('POST', '/auth/login', { body: { email, password: PASSWORD } }));
  }
  assert.ok(data.requiresOtp, '2FA deveria ser exigido');
  const verified = await api('POST', '/auth/verify-otp', {
    body: { tempToken: data.tempToken, code: authenticator.generate(secret) },
  });
  assert.ok(verified.data.accessToken, 'verify-otp falhou');
  return { token: verified.data.accessToken, setupSecret: secret };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, transports: ['websocket'], reconnection: false });
    const events = [];
    socket.onAny((event, payload) => events.push({ event, payload }));
    socket.on('connected', () => resolve({ socket, events }));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket não conectou')), 5000);
  });
}

const lastSent = (fake) => fake.sentTo(CHAT_ID).at(-1)?.text ?? '';

// ── execução ──────────────────────────────────────────────────────────────────
let backend;
let fake;
const sockets = [];
const DB_FILE = path.join(BACKEND, 'prisma', 'e2e.db');

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  E2E — Canal Telegram (Bot API fake + backend real)  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  fake = await startFakeTelegram({ token: FAKE_TOKEN });

  const env = {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: 'file:./e2e.db',
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    TOTP_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
    TELEGRAM_BOT_TOKEN: FAKE_TOKEN, // nunca o token real nos testes
    TELEGRAM_API_BASE: fake.baseUrl,
  };

  console.log('Preparando banco isolado (prisma/e2e.db) e build...');
  execSync('npx prisma migrate reset --force --skip-generate', { cwd: BACKEND, env, stdio: 'ignore' });
  if (!existsSync(path.join(BACKEND, 'dist', 'main.js')) || process.env.E2E_BUILD !== '0') {
    execSync('npm run build', { cwd: BACKEND, stdio: 'ignore', shell: true });
  }

  backend = spawn(process.execPath, ['dist/main.js'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let backendLog = '';
  backend.stdout.on('data', (d) => (backendLog += d));
  backend.stderr.on('data', (d) => (backendLog += d));
  backend.on('exit', (code) => {
    if (code && code !== 0) console.error(`\nBackend saiu com código ${code}\n${backendLog.slice(-2000)}`);
  });

  await waitFor(() => fetch(`${API}/channels`).then((r) => r.status === 401), { timeout: 30000, label: 'backend subir' });
  await waitFor(() => backendLog.includes('long polling iniciado'), { timeout: 10000, label: 'long polling' });
  console.log('Backend de teste no ar.\n');

  // ── Preparação ──
  const carlos = await loginClient('carlos.cliente@email.com');
  const fernanda = await loginClient('fernanda.cliente@email.com');
  const { token: agent } = await loginStaff('joao.atendente@claro.com.br');
  const agentWs = await connectSocket(agent);
  const carlosWs = await connectSocket(carlos);
  sockets.push(agentWs.socket, carlosWs.socket);

  console.log('[Canais]');
  await step('GET /channels lista WebChat e Telegram como REAIS e Telefone como MOCK', async () => {
    const { data } = await api('GET', '/channels', { token: carlos });
    const kinds = Object.fromEntries(data.map((c) => [c.code, c.kind]));
    assert.deepEqual(kinds, { WEBCHAT: 'REAL', TELEGRAM: 'REAL', PHONE: 'MOCK' });
    assert.equal(data.find((c) => c.code === 'TELEGRAM').enabled, true);
  });

  console.log('\n[Vínculo do Telegram]');
  await step('chat não vinculado recebe instruções de vínculo', async () => {
    fake.pushText(CHAT_ID, 'Oi, preciso de ajuda');
    await waitFor(() => lastSent(fake).includes('vincule sua conta'), { label: 'instruções' });
  });

  await step('código inválido é recusado', async () => {
    fake.pushText(CHAT_ID, '/vincular ZZZZ9999');
    await waitFor(() => lastSent(fake).includes('Código inválido'), { label: 'recusa' });
  });

  let linkCode;
  await step('cliente logado gera código de uso único e deep link', async () => {
    const { status, data } = await api('POST', '/channels/telegram/link-code', { token: carlos });
    assert.equal(status, 201);
    assert.match(data.code, /^[A-Z0-9]{8}$/);
    assert.equal(data.deepLink, `https://t.me/claro_test_bot?start=${data.code}`);
    linkCode = data.code;
  });

  await step('/start CÓDIGO (deep link) vincula o chat à conta e avisa o WebChat via WebSocket', async () => {
    fake.pushText(CHAT_ID, `/start ${linkCode}`);
    await waitFor(() => lastSent(fake).includes('Telegram está vinculado'), { label: 'confirmação' });
    const { data } = await api('GET', '/channels/telegram', { token: carlos });
    assert.equal(data.linked, true);
    await waitFor(() => carlosWs.events.some((e) => e.event === 'channel_link_updated'), { label: 'evento WS' });
  });

  await step('código já usado não pode ser reutilizado', async () => {
    fake.pushText('555000999', `/vincular ${linkCode}`);
    await waitFor(() => fake.sentTo('555000999').at(-1)?.text.includes('inválido'), { label: 'recusa reuso' });
  });

  console.log('\n[Protocolo pelo Telegram]');
  let protocol;
  await step('primeira mensagem livre reaproveita o protocolo aberto mais recente', async () => {
    const before = await api('GET', '/protocols', { token: carlos });
    const openOnes = before.data.filter((p) => p.status !== 'CLOSED');
    fake.pushText(CHAT_ID, 'Continuo com problema na internet');
    await waitFor(() => lastSent(fake).includes('Mensagem registrada no protocolo'), { label: 'reaproveitamento' });
    assert.ok(lastSent(fake).includes(openOnes[0].protocolNumber));
  });

  await step('/novo assunto abre protocolo CLR-AAAA-NNNNN com canal TELEGRAM', async () => {
    agentWs.events.length = 0;
    fake.pushText(CHAT_ID, '/novo Internet lenta no quarto');
    await waitFor(() => lastSent(fake).includes('aberto'), { label: 'protocolo criado' });
    const number = /CLR-\d{4}-\d{5}/.exec(lastSent(fake))[0];
    const { data } = await api('GET', '/protocols', { token: carlos });
    protocol = data.find((p) => p.protocolNumber === number);
    assert.ok(protocol, 'protocolo não encontrado na conta do cliente');
    assert.equal(protocol.currentChannel, 'TELEGRAM');
    assert.equal(protocol.title, 'Internet lenta no quarto');
    await waitFor(() => agentWs.events.some((e) => e.event === 'protocols_list_updated'), { label: 'painel notificado' });
  });

  let telegramUpdate;
  await step('mensagem do Telegram chega ao painel do atendente via WebSocket', async () => {
    const ack = await agentWs.socket.timeout(3000).emitWithAck('join_protocol', { protocolId: protocol.id });
    assert.equal(ack.ok, true);
    telegramUpdate = fake.pushText(CHAT_ID, 'A conexão cai toda noite depois das 22h');
    const evt = await waitFor(
      () => agentWs.events.find((e) => e.event === 'new_message' && e.payload.content.includes('22h')),
      { label: 'new_message no painel' },
    );
    assert.equal(evt.payload.channel, 'TELEGRAM');
    assert.equal(evt.payload.senderRole, 'CLIENT');
    assert.equal(evt.payload.protocolId, protocol.id);
  });

  await step('reentrega do mesmo update não duplica a mensagem (idempotência)', async () => {
    fake.pushText(CHAT_ID, telegramUpdate.message.text, { messageId: telegramUpdate.message.message_id });
    await sleep(800);
    const { data } = await api('GET', `/protocols/${protocol.id}`, { token: agent });
    assert.equal(data.messages.filter((m) => m.content.includes('22h')).length, 1);
  });

  console.log('\n[Troca de canal — mesma timeline]');
  await step('cliente continua pelo WebChat no MESMO protocolo', async () => {
    const { status } = await api('POST', `/protocols/${protocol.id}/messages`, {
      token: carlos,
      body: { content: 'Agora estou escrevendo pelo WebChat' },
    });
    assert.equal(status, 201);
    const { data } = await api('GET', `/protocols/${protocol.id}`, { token: carlos });
    const channels = data.messages.map((m) => m.channel);
    assert.ok(channels.includes('TELEGRAM') && channels.includes('WEBCHAT'));
    assert.equal(data.currentChannel, 'WEBCHAT');
  });

  await step('/historico no Telegram mostra as mensagens dos dois canais', async () => {
    fake.pushText(CHAT_ID, '/historico');
    await waitFor(() => lastSent(fake).includes('Histórico de'), { label: 'histórico' });
    const text = lastSent(fake);
    assert.ok(text.includes('WebChat') && text.includes('Telegram'), text);
    assert.ok(text.includes('Agora estou escrevendo pelo WebChat'));
  });

  console.log('\n[Resposta do atendente]');
  await step('painel informa que o cliente tem Telegram disponível', async () => {
    const { data } = await api('GET', `/protocols/${protocol.id}`, { token: agent });
    assert.deepEqual([...data.availableChannels].sort(), ['PHONE', 'TELEGRAM', 'WEBCHAT']);
  });

  await step('resposta do atendente pelo canal TELEGRAM chega ao chat e marca SENT', async () => {
    const { status, data: msg } = await api('POST', `/protocols/${protocol.id}/messages`, {
      token: agent,
      body: { content: 'Vamos agendar uma visita técnica para amanhã.', channel: 'TELEGRAM' },
    });
    assert.equal(status, 201);
    await waitFor(() => lastSent(fake).includes('Vamos agendar uma visita técnica'), { label: 'entrega no Telegram' });
    assert.ok(lastSent(fake).includes('João Atendente'));
    assert.ok(lastSent(fake).includes(protocol.protocolNumber));
    await waitFor(
      () => agentWs.events.find((e) => e.event === 'message_updated' && e.payload.id === msg.id && e.payload.deliveryStatus === 'SENT'),
      { label: 'status de entrega' },
    );
  });

  await step('resposta pelo WebChat NÃO é enviada ao Telegram', async () => {
    const count = fake.sentTo(CHAT_ID).length;
    await api('POST', `/protocols/${protocol.id}/messages`, {
      token: agent,
      body: { content: 'Resposta só no WebChat', channel: 'WEBCHAT' },
    });
    await sleep(500);
    assert.equal(fake.sentTo(CHAT_ID).length, count);
  });

  await step('atendente não pode responder via Telegram a cliente sem vínculo (400)', async () => {
    const { data: list } = await api('GET', '/protocols', { token: fernanda });
    const { status } = await api('POST', `/protocols/${list[0].id}/messages`, {
      token: agent,
      body: { content: 'teste', channel: 'TELEGRAM' },
    });
    assert.equal(status, 400);
  });

  console.log('\n[Telefone — mock assumido]');
  await step('ligação simulada entra na mesma timeline com dados fictícios', async () => {
    const { status, data } = await api('POST', '/channels/phone/mock-call', {
      token: agent,
      body: { protocolId: protocol.id },
    });
    assert.equal(status, 201);
    assert.equal(data.channel, 'PHONE');
    assert.match(data.content, /Ligação simulada/);
  });

  await step('cliente não pode simular ligação (403)', async () => {
    const { status } = await api('POST', '/channels/phone/mock-call', { token: carlos, body: { protocolId: protocol.id } });
    assert.equal(status, 403);
  });

  console.log('\n[Encerramento]');
  let closedNumber;
  await step('ao encerrar, o cliente é avisado no Telegram', async () => {
    // o protocolo ativo do chat é o que recebeu a última resposta pelo Telegram
    await api('PATCH', `/protocols/${protocol.id}`, { token: agent, body: { status: 'CLOSED' } });
    await waitFor(() => lastSent(fake).includes('foi encerrado'), { label: 'aviso de encerramento' });
    closedNumber = protocol.protocolNumber;
  });

  await step('mensagem após encerramento vai para outro protocolo (nunca reabre o encerrado)', async () => {
    fake.pushText(CHAT_ID, 'Tenho uma nova dúvida sobre a fatura');
    await waitFor(() => /protocolo CLR-\d{4}-\d{5}/.test(lastSent(fake)) && !lastSent(fake).includes(closedNumber), {
      label: 'novo protocolo',
    });
  });

  console.log('\n[Segurança e LGPD]');
  await step('cliente não entra na sala WebSocket de protocolo de outro cliente', async () => {
    const { data: list } = await api('GET', '/protocols', { token: fernanda });
    const ack = await carlosWs.socket.timeout(3000).emitWithAck('join_protocol', { protocolId: list[0].id });
    assert.equal(ack.ok, false);
  });

  await step('token restrito (setupToken de 2FA) não abre WebSocket', async () => {
    const { data } = await api('POST', '/auth/login', { body: { email: 'maria.atendente@claro.com.br', password: PASSWORD } });
    assert.ok(data.setupToken);
    await assert.rejects(connectSocket(data.setupToken));
  });

  await step('cadastro público não aceita perfil privilegiado', async () => {
    const { status } = await api('POST', '/auth/register', {
      body: { name: 'Invasor', email: 'invasor@teste.com', password: '12345678', role: 'ADMIN' },
    });
    assert.equal(status, 400);
  });

  await step('bot não atende em grupos', async () => {
    fake.pushText('-100123', 'mensagem em grupo', { chatType: 'group' });
    await waitFor(() => fake.sentTo('-100123').at(-1)?.text.includes('conversa privada'), { label: 'recusa grupo' });
  });

  await step('/desvincular remove o vínculo (direito do titular)', async () => {
    fake.pushText(CHAT_ID, '/desvincular');
    await waitFor(() => lastSent(fake).includes('desvinculado'), { label: 'desvínculo' });
    const { data } = await api('GET', '/channels/telegram', { token: carlos });
    assert.equal(data.linked, false);
  });

  await step('o token do bot nunca aparece nos logs do backend', async () => {
    assert.ok(!backendLog.includes(FAKE_TOKEN));
  });

  console.log(`\n✅ ${passed} verificações passaram.\n`);
}

async function cleanup() {
  sockets.forEach((s) => s.disconnect());
  if (backend && backend.exitCode === null) {
    backend.kill();
    await new Promise((r) => backend.once('exit', r));
  }
  await fake?.close();
  for (const f of [DB_FILE, `${DB_FILE}-journal`]) if (existsSync(f)) rmSync(f, { force: true });
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.log('❌');
    console.error(`\nFalha: ${err.message}\n`);
    await cleanup();
    process.exit(1);
  });
