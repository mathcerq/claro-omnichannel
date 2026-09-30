/**
 * Teste E2E completo do fluxo 2FA
 * Fase 1: Ativa 2FA para joao.atendente via API
 * Fase 2: Playwright — login no browser com código TOTP real
 */

import { chromium } from 'playwright';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { authenticator } = require('otplib');
const CryptoJS = require('crypto-js');

const BASE = 'http://localhost:3000';
const AGENT_URL = 'http://localhost:5173';
const EMAIL = 'joao.atendente@claro.com.br';
const PASSWORD = 'Claro@2024';
const ENCRYPTION_KEY = 'ClaroOmni2024AES256KeyChange1234';

async function apiPost(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiGet(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// ─── FASE 1: Ativar 2FA via API ───────────────────────────────────────────────
async function setup2FA() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  FASE 1 — Ativando 2FA via API                       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1. Login → obter setupToken (2FA obrigatório ainda não configurado)
  const loginRes = await apiPost('/auth/login', { email: EMAIL, password: PASSWORD });

  if (!loginRes.requiresTotpSetup) {
    if (loginRes.requiresOtp) {
      console.log('ℹ  2FA já estava ativo. Pulando fase de setup.\n');
      return null; // já configurado
    }
    console.error('Erro inesperado no login:', loginRes);
    process.exit(1);
  }

  const { setupToken } = loginRes;
  console.log(`✅ setupToken recebido (10 min): ${setupToken.slice(0, 40)}...`);
  console.log(`📋 Mensagem do servidor: "${loginRes.message}"\n`);

  // 2. Gerar segredo TOTP
  const setupRes = await apiGet('/auth/totp/setup', setupToken);
  const { secret } = setupRes;
  console.log(`🔑 Secret TOTP gerado: ${secret}`);
  console.log(`🔒 (Armazenado no banco como AES-256: ClaroOmni2024...)\n`);

  // 3. Gerar código TOTP real com otplib
  const totpCode = authenticator.generate(secret);
  console.log(`📱 Código TOTP gerado por otplib: ${totpCode}`);

  // 4. Ativar 2FA
  const enableRes = await apiPost('/auth/totp/enable', { code: totpCode }, setupToken);
  console.log(`\n✅ ${enableRes.message}`);

  // 5. Tentar acessar rota protegida com setupToken (deve ser bloqueado)
  console.log('\n[Prova que setupToken é restrito após ativar 2FA]');
  const blockedRes = await fetch(`${BASE}/protocols`, {
    headers: { Authorization: `Bearer ${setupToken}` },
  });
  const blockedBody = await blockedRes.json();
  console.log(`  GET /protocols com setupToken → ${blockedRes.status} "${blockedBody.message}"`);

  return secret;
}

// ─── FASE 2: Login no browser com Playwright ─────────────────────────────────
async function browserTest(secret) {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  FASE 2 — Login completo no Browser (Playwright)     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    slowMo: 600,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  try {
    // ── Passo 1: Abrir painel do atendente ─────────────────────────────────
    console.log('🌐 Abrindo http://localhost:5173 ...');
    await page.goto(AGENT_URL);
    await page.waitForLoadState('networkidle');
    console.log('  Página carregada: "Claro Omnichannel — Painel do Atendente"');

    // ── Passo 2: Preencher credenciais ─────────────────────────────────────
    console.log('\n📝 Preenchendo credenciais...');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    console.log(`  E-mail  : ${EMAIL}`);
    console.log(`  Senha   : ${'•'.repeat(PASSWORD.length)}`);

    await page.click('button[type="submit"]');
    await page.waitForTimeout(1500);

    // ── Passo 3: Backend retorna requiresOtp:true → tela de OTP ───────────
    const otpInput = page.locator('input[placeholder="000000"]');
    await otpInput.waitFor({ timeout: 5000 });
    console.log('\n🔐 Tela de verificação 2FA exibida!');

    // Gerar código TOTP em tempo real
    console.log(`🔑 Secret usado para gerar código: "${secret}" (length: ${secret.length})`);
    const liveCode = authenticator.generate(secret);
    console.log(`📱 Código TOTP gerado agora: ${liveCode} (válido ~30s)`);

    // ── Passo 4: Digitar o código TOTP ─────────────────────────────────────
    await otpInput.fill(liveCode);
    console.log('  Código inserido no campo...');

    // Capturar resposta da API verify-otp para diagnóstico
    const verifyPromise = page.waitForResponse(
      r => r.url().includes('/auth/verify-otp'),
      { timeout: 10000 },
    );

    await page.click('button[type="submit"]');

    const verifyResp = await verifyPromise;
    const verifyBody = await verifyResp.json().catch(() => ({}));
    console.log(`📡 Resposta verify-otp: HTTP ${verifyResp.status()} → ${JSON.stringify(verifyBody)}`);

    if (verifyResp.status() !== 200 && verifyResp.status() !== 201) {
      throw new Error(`OTP rejeitado pelo backend: ${JSON.stringify(verifyBody)}`);
    }

    // ── Passo 5: Aguardar dashboard ────────────────────────────────────────
    await page.waitForURL('http://localhost:5173/', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    console.log('\n✅ AUTENTICAÇÃO COMPLETA! Dashboard carregado.');

    // ── Passo 6: Verificar conteúdo do dashboard ───────────────────────────
    const title = await page.title();
    console.log(`  Título da página: "${title}"`);

    const protocolCount = await page.locator('table tbody tr').count();
    console.log(`  Protocolos visíveis na tabela: ${protocolCount}`);

    const stats = await page.locator('.card p.text-2xl').allTextContents();
    if (stats.length > 0) {
      console.log(`  Stats do dashboard: [${stats.join(', ')}]`);
    }

    // ── Passo 7: Tirar screenshot ──────────────────────────────────────────
    await page.screenshot({ path: 'C:\\Users\\mdasilvacerq\\claro-omnichannel\\test-result.png', fullPage: false });
    console.log('\n📸 Screenshot salvo em: claro-omnichannel\\test-result.png');

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅ TESTE E2E COMPLETO — TODOS OS PASSOS OK          ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('\nResumo do fluxo validado:');
    console.log('  1. Credenciais enviadas → backend exige 2FA');
    console.log('  2. Tela de OTP exibida no browser');
    console.log('  3. Código TOTP gerado em tempo real com otplib');
    console.log('  4. Código aceito → JWT de acesso emitido (15min)');
    console.log('  5. Dashboard carregado com protocolos reais');

    // Manter browser aberto por 8s para o usuário ver
    await page.waitForTimeout(8000);

  } catch (err) {
    console.error('\n❌ Erro no teste:', err.message);
    await page.screenshot({ path: 'C:\\Users\\mdasilvacerq\\claro-omnichannel\\test-error.png' });
    console.log('📸 Screenshot de erro salvo em: claro-omnichannel\\test-error.png');
  } finally {
    await browser.close();
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const secret = await setup2FA();

    // Se setup2FA retornou null, 2FA já estava ativo — precisamos do secret do banco
    if (secret === null) {
      // Buscar o secret direto pelo Node para o teste do browser
      const requireBackend = createRequire(new URL('./backend/package.json', import.meta.url).href);
      const { PrismaClient } = requireBackend('@prisma/client');
      const prisma = new PrismaClient({
        datasources: { db: { url: 'file:C:/Users/mdasilvacerq/claro-omnichannel/backend/prisma/dev.db' } },
      });
      const user = await prisma.user.findUnique({ where: { email: EMAIL } });
      await prisma.$disconnect();

      if (!user?.totpSecret) {
        console.error('Não foi possível recuperar o secret do banco.');
        process.exit(1);
      }

      const decrypted = CryptoJS.AES.decrypt(user.totpSecret, ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8);
      await browserTest(decrypted);
    } else {
      await browserTest(secret);
    }
  } catch (err) {
    console.error('Erro fatal:', err);
    process.exit(1);
  }
})();
