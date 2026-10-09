/**
 * Infraestrutura comum dos testes E2E: backend isolado (banco próprio, Bot API
 * fake), chamadas à API, login com 2FA e WebSocket.
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
export const { authenticator } = require('otplib');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND = path.join(ROOT, 'backend');
export const PASSWORD = 'Claro@2024';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 8000, interval = 100, label = 'condição' } = {}) {
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

/** Contador de passos com saída legível; o primeiro erro interrompe o teste. */
export function createStepper() {
  let passed = 0;
  return {
    async step(name, fn) {
      process.stdout.write(`  • ${name} ... `);
      await fn();
      passed++;
      console.log('✅');
    },
    get passed() {
      return passed;
    },
  };
}

/**
 * Sobe Bot API fake + backend real (dist/main.js) com banco SQLite isolado.
 * Nunca usa o token real do .env: TELEGRAM_BOT_TOKEN é sobrescrito.
 */
export async function startTestBackend({ port = 3100, dbName = 'e2e.db', corsOrigins, assistant = 'off' } = {}) {
  const fakeToken = `e2e-${randomBytes(8).toString('hex')}`;
  const fake = await startFakeTelegram({ token: fakeToken });
  const dbFile = path.join(BACKEND, 'prisma', dbName);

  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:./${dbName}`,
    JWT_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    TOTP_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
    TELEGRAM_BOT_TOKEN: fakeToken,
    TELEGRAM_API_BASE: fake.baseUrl,
    // Assistente virtual: desligada por padrão; 'rules' = determinística (sem IA real)
    ASSISTANT_ENGINE: assistant,
    ASSISTANT_DEBOUNCE_MS: '150',
    ...(corsOrigins ? { CORS_ORIGINS: corsOrigins } : {}),
  };

  execSync('npx prisma migrate reset --force --skip-generate', { cwd: BACKEND, env, stdio: 'ignore' });
  if (!existsSync(path.join(BACKEND, 'dist', 'main.js')) || process.env.E2E_BUILD !== '0') {
    execSync('npm run build', { cwd: BACKEND, stdio: 'ignore', shell: true });
  }

  const child = spawn(process.execPath, ['dist/main.js'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { log: '' };
  child.stdout.on('data', (d) => (state.log += d));
  child.stderr.on('data', (d) => (state.log += d));
  child.on('exit', (code) => {
    if (code) console.error(`\nBackend de teste saiu com código ${code}\n${state.log.slice(-2000)}`);
  });

  const url = `http://localhost:${port}`;
  await waitFor(() => fetch(`${url}/channels`).then((r) => r.status === 401), { timeout: 30000, label: 'backend subir' });
  await waitFor(() => state.log.includes('long polling iniciado'), { timeout: 10000, label: 'long polling' });

  const client = createApiClient(url);
  return {
    url,
    fake,
    fakeToken,
    api: client.api,
    get log() {
      return state.log;
    },
    async stop() {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((r) => child.once('exit', r));
      }
      await fake.close();
      for (const f of [dbFile, `${dbFile}-journal`]) if (existsSync(f)) rmSync(f, { force: true });
    },
  };
}

export function createApiClient(baseUrl) {
  async function api(method, url, { token, body } = {}) {
    const res = await fetch(`${baseUrl}${url}`, {
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
  return { api };
}

export async function loginClient(api, email) {
  const { data } = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.ok(data.accessToken, `login de ${email} falhou`);
  return data.accessToken;
}

/**
 * Atendente: configura o 2FA obrigatório e faz login com TOTP.
 * Retorna o token e o segredo TOTP (para logar no navegador depois).
 */
export async function setupStaff2FA(api, email) {
  const { data } = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.ok(data.requiresTotpSetup, '2FA obrigatório deveria ser exigido no primeiro acesso');
  const setup = await api('GET', '/auth/totp/setup', { token: data.setupToken });
  const secret = setup.data.secret;
  await api('POST', '/auth/totp/enable', { token: data.setupToken, body: { code: authenticator.generate(secret) } });
  return secret;
}

export async function loginStaff(api, email, secret) {
  const { data } = await api('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.ok(data.requiresOtp, '2FA deveria ser exigido');
  const verified = await api('POST', '/auth/verify-otp', {
    body: { tempToken: data.tempToken, code: authenticator.generate(secret) },
  });
  assert.ok(verified.data.accessToken, 'verify-otp falhou');
  return verified.data.accessToken;
}

export function connectSocket(url, token) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false });
    const events = [];
    socket.onAny((event, payload) => events.push({ event, payload }));
    socket.on('connected', () => resolve({ socket, events }));
    socket.on('connect_error', reject);
    socket.on('unauthorized', () => reject(new Error('socket recusado pelo servidor')));
    setTimeout(() => reject(new Error('socket não conectou')), 5000);
  });
}
