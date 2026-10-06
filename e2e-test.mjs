/**
 * Teste E2E do fluxo 2FA obrigatório (contra os servidores de desenvolvimento)
 * Fase 1: ativa o 2FA do joao.atendente via API (se ainda não estiver ativo)
 * Fase 2: Playwright — login no navegador com código TOTP real
 *
 * Pré-requisito: backend (:3000) e painel do atendente (:5173) rodando.
 * Uso: npm run test:e2e:2fa            (headless)
 *      HEADED=1 npm run test:e2e:2fa   (mostra o navegador)
 *
 * Segurança: tokens e segredos nunca são impressos por inteiro.
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { authenticator } = require('otplib');
const CryptoJS = require('crypto-js');

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_URL || 'http://localhost:3000';
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:5173';
const EMAIL = 'joao.atendente@claro.com.br';
const PASSWORD = 'Claro@2024';
const SHOTS = path.join(ROOT, 'test-results', '2fa');

const mask = (value) => (value ? `${String(value).slice(0, 6)}…(${String(value).length} chars)` : '—');

/** Lê variáveis do backend/.env (para descriptografar o segredo TOTP já salvo) */
function backendEnv() {
  const env = {};
  for (const line of readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

async function apiPost(urlPath, body, token) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(urlPath, token) {
  const res = await fetch(`${BASE}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// ─── FASE 1: Ativar 2FA via API ───────────────────────────────────────────────
async function setup2FA() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  FASE 1 — Ativando 2FA via API                       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const loginRes = await apiPost('/auth/login', { email: EMAIL, password: PASSWORD });

  if (!loginRes.requiresTotpSetup) {
    if (loginRes.requiresOtp) {
      console.log('ℹ  2FA já estava ativo. Pulando fase de setup.\n');
      return null;
    }
    throw new Error(`Resposta inesperada no login: ${JSON.stringify(loginRes)}`);
  }

  const { setupToken } = loginRes;
  console.log(`✅ setupToken recebido (10 min): ${mask(setupToken)}`);
  console.log(`📋 Mensagem do servidor: "${loginRes.message}"\n`);

  const { secret } = await apiGet('/auth/totp/setup', setupToken);
  console.log(`🔑 Secret TOTP gerado: ${mask(secret)} (armazenado no banco cifrado com AES)`);

  const totpCode = authenticator.generate(secret);
  const enableRes = await apiPost('/auth/totp/enable', { code: totpCode }, setupToken);
  if (!enableRes.message?.includes('ativado')) throw new Error(`Falha ao ativar 2FA: ${JSON.stringify(enableRes)}`);
  console.log(`✅ ${enableRes.message}`);

  console.log('\n[setupToken é restrito a /auth/totp/*]');
  const blockedRes = await fetch(`${BASE}/protocols`, { headers: { Authorization: `Bearer ${setupToken}` } });
  const blockedBody = await blockedRes.json();
  console.log(`  GET /protocols com setupToken → ${blockedRes.status} "${blockedBody.message}"`);
  if (blockedRes.status !== 403) throw new Error('setupToken deveria ser bloqueado (403)');

  return secret;
}

/** 2FA já ativo: recupera o segredo do banco local (somente ambiente de desenvolvimento). */
async function secretFromDatabase() {
  const env = backendEnv();
  const requireBackend = createRequire(path.join(ROOT, 'backend', 'package.json'));
  const { PrismaClient } = requireBackend('@prisma/client');
  const dbUrl = env.DATABASE_URL.replace('file:./', `file:${path.join(ROOT, 'backend', 'prisma')}/`);
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  await prisma.$disconnect();
  if (!user?.totpSecret) throw new Error('Não foi possível recuperar o secret do banco.');
  return CryptoJS.AES.decrypt(user.totpSecret, env.TOTP_ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
}

// ─── FASE 2: Login no browser com Playwright ─────────────────────────────────
async function browserTest(secret) {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  FASE 2 — Login completo no Browser (Playwright)     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  mkdirSync(SHOTS, { recursive: true });
  const headed = !!process.env.HEADED;
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: !headed,
    slowMo: headed ? 400 : 0,
  });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();

  try {
    console.log(`🌐 Abrindo ${AGENT_URL} ...`);
    await page.goto(AGENT_URL);
    await page.waitForLoadState('networkidle');

    console.log('📝 Preenchendo credenciais...');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    const otpInput = page.locator('input[placeholder="000000"]');
    await otpInput.waitFor({ timeout: 5000 });
    console.log('🔐 Tela de verificação 2FA exibida!');

    await otpInput.fill(authenticator.generate(secret));
    const verifyPromise = page.waitForResponse((r) => r.url().includes('/auth/verify-otp'), { timeout: 10000 });
    await page.click('button[type="submit"]');
    const verifyResp = await verifyPromise;
    console.log(`📡 verify-otp → HTTP ${verifyResp.status()}`);
    if (![200, 201].includes(verifyResp.status())) {
      throw new Error(`OTP rejeitado pelo backend: ${JSON.stringify(await verifyResp.json().catch(() => ({})))}`);
    }

    await page.waitForURL(`${AGENT_URL}/`, { timeout: 15000 });
    await page.locator('table tbody tr').first().waitFor({ timeout: 10000 });
    console.log('\n✅ AUTENTICAÇÃO COMPLETA! Dashboard carregado.');
    console.log(`  Protocolos visíveis na tabela: ${await page.locator('table tbody tr').count()}`);
    const stats = await page.locator('.card p.text-2xl').allTextContents();
    if (stats.length > 0) console.log(`  Stats do dashboard: [${stats.join(', ')}]`);

    const shotPath = path.join(SHOTS, 'dashboard.png');
    await page.screenshot({ path: shotPath });
    console.log(`\n📸 Screenshot: ${path.relative(ROOT, shotPath)}`);

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅ TESTE E2E 2FA COMPLETO — TODOS OS PASSOS OK      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    if (headed) await page.waitForTimeout(5000);
  } catch (err) {
    await page.screenshot({ path: path.join(SHOTS, 'erro.png') }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const secret = (await setup2FA()) ?? (await secretFromDatabase());
    await browserTest(secret);
  } catch (err) {
    console.error(`\n❌ Falha: ${err.message}`);
    console.error('   Os servidores estão rodando? (backend :3000 e painel :5173)');
    process.exit(1);
  }
})();
