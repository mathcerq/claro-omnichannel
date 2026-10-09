/**
 * E2E de INTERFACE (Playwright + Chrome): a jornada omnichannel completa,
 * com o painel do atendente e o app do cliente abertos ao mesmo tempo.
 *
 * Sobe backend isolado (porta 3200, Bot API fake) e os dois frontends em modo
 * dev (portas 5273/5274) apontando para ele. O "cliente no Telegram" é
 * simulado pelo servidor fake; todo o resto roda de verdade no navegador.
 *
 * Uso: npm run test:e2e:ui            (headless)
 *      HEADED=1 npm run test:e2e:ui   (mostra o navegador)
 * Screenshots: test-results/ui/
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  ROOT,
  PASSWORD,
  authenticator,
  sleep,
  waitFor,
  createStepper,
  startTestBackend,
} from './helpers.mjs';

const API_PORT = 3200;
const AGENT_PORT = 5273;
const CLIENT_PORT = 5274;
const AGENT_URL = `http://localhost:${AGENT_PORT}`;
const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;
const CHAT_ID = '888000222';
const SHOTS = path.join(ROOT, 'test-results', 'ui');

const stepper = createStepper();
const step = stepper.step.bind(stepper);
const children = [];
let env;
let browser;

function startVite(dir, port) {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], {
    cwd: path.join(ROOT, dir),
    env: { ...process.env, VITE_API_URL: `http://localhost:${API_PORT}` },
    stdio: 'ignore',
  });
  children.push(child);
  return waitFor(() => fetch(`http://localhost:${port}`).then((r) => r.ok), { timeout: 30000, label: `vite ${dir}` });
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  E2E UI — Jornada omnichannel no navegador           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');
  mkdirSync(SHOTS, { recursive: true });

  console.log('Subindo backend isolado e frontends...');
  env = await startTestBackend({
    port: API_PORT,
    dbName: 'e2e-ui.db',
    corsOrigins: `${AGENT_URL},${CLIENT_URL}`,
  });
  await Promise.all([startVite('frontend-agent', AGENT_PORT), startVite('frontend-client', CLIENT_PORT)]);
  const { fake, api } = env;
  const lastSent = () => fake.sentTo(CHAT_ID).at(-1)?.text ?? '';

  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: !process.env.HEADED });
  const client = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
  const agent = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  console.log('Ambiente pronto.\n');

  console.log('[Cliente — WebChat]');
  await step('cliente faz login no app (PWA)', async () => {
    await client.goto(`${CLIENT_URL}/login`);
    await client.fill('input[type="email"]', 'carlos.cliente@email.com');
    await client.fill('input[type="password"]', PASSWORD);
    await client.click('button[type="submit"]');
    await client.getByText('Meus Protocolos').waitFor();
  });

  await step('cliente gera código e vincula o Telegram (confirmação em tempo real)', async () => {
    await client.getByText('Conectar Telegram').click();
    await client.getByRole('button', { name: 'Gerar código de vínculo' }).click();
    const code = (await client.locator('p.text-4xl').textContent()).trim();
    assert.match(code, /^[A-Z0-9]{8}$/);
    await shot(client, '01-cliente-codigo-telegram');
    fake.pushText(CHAT_ID, `/start ${code}`); // o cliente toca em "Abrir no Telegram"
    await client.getByRole('heading', { name: 'Telegram conectado' }).waitFor({ timeout: 8000 });
    await shot(client, '02-cliente-telegram-conectado');
  });

  let protocolNumber;
  await step('cliente abre chamado pelo Telegram e ele aparece no app sem recarregar', async () => {
    await client.goto(`${CLIENT_URL}/`);
    await client.getByText('Meus Protocolos').waitFor();
    fake.pushText(CHAT_ID, '/novo Sinal de TV some à noite');
    await waitFor(() => /CLR-\d{4}-\d{5}/.test(lastSent()), { label: 'protocolo criado' });
    protocolNumber = /CLR-\d{4}-\d{5}/.exec(lastSent())[0];
    await client.getByText(protocolNumber).waitFor({ timeout: 8000 });
  });

  console.log('\n[Atendente — Painel]');
  const agentLogin = async () => {
    await agent.fill('input[type="email"]', 'joao.atendente@claro.com.br');
    await agent.fill('input[type="password"]', PASSWORD);
    await agent.click('button[type="submit"]');
  };

  let agentSecret;
  await step('primeiro acesso: atendente configura o 2FA obrigatório pela tela (QR Code)', async () => {
    await agent.goto(`${AGENT_URL}/login`);
    await agentLogin();
    await agent.getByRole('button', { name: 'Configurar 2FA agora' }).click();
    // O QR Code precisa renderizar (antes, a página quebrava e ficava vazia)
    await agent.locator('svg[height="190"]').waitFor({ timeout: 8000 });
    agentSecret = (await agent.locator('p.select-all').textContent()).trim();
    assert.match(agentSecret, /^[A-Z2-7]{16,}$/);
    await shot(agent, '00-painel-configurar-2fa');
    await agent.getByRole('button', { name: /Já escaneei/ }).click();
    await agent.locator('input[placeholder="000000"]').fill(authenticator.generate(agentSecret));
    await agent.getByRole('button', { name: 'Ativar 2FA e fazer login' }).click();
    await agent.locator('input[type="email"]').waitFor();
  });

  await step('atendente faz login com 2FA (TOTP)', async () => {
    await agentLogin();
    await agent.locator('input[placeholder="000000"]').fill(authenticator.generate(agentSecret));
    await agent.click('button[type="submit"]');
    await agent.getByText('Painel do Atendente').waitFor();
  });

  await step('dashboard mostra canais reais/mock e o protocolo vindo do Telegram', async () => {
    await agent.getByText(protocolNumber).waitFor();
    const channels = await agent.locator('text=Canais').locator('..').textContent();
    assert.ok(channels.includes('Telegram') && channels.includes('mock'), channels);
    await shot(agent, '03-painel-dashboard');
  });

  await step('protocolo novo de outro cliente surge no dashboard em tempo real', async () => {
    const fernanda = await api('POST', '/auth/login', { body: { email: 'fernanda.cliente@email.com', password: PASSWORD } });
    const created = await api('POST', '/protocols', {
      token: fernanda.data.accessToken,
      body: { title: 'Roteador Wi-Fi reiniciando sozinho' },
    });
    await agent.getByText(created.data.protocolNumber).waitFor({ timeout: 8000 });
  });

  await step('atendente abre o protocolo: Telegram aparece como vinculado', async () => {
    await agent.getByText(protocolNumber).click();
    await agent.getByText('Canais do cliente').waitFor();
    await agent.getByText('vinculado', { exact: true }).waitFor();
  });

  console.log('\n[Troca de canal — mesma timeline]');
  await client.getByText(protocolNumber).click();
  await client.getByPlaceholder('Digite sua mensagem...').waitFor();

  await step('mensagem do Telegram aparece ao vivo no painel e no WebChat', async () => {
    fake.pushText(CHAT_ID, 'O sinal some por volta das 21h');
    await agent.getByText('O sinal some por volta das 21h').waitFor({ timeout: 8000 });
    await client.getByText('O sinal some por volta das 21h').waitFor({ timeout: 8000 });
    await client.getByText('via Telegram').first().waitFor();
  });

  await step('cliente continua pelo WebChat e o painel recebe ao vivo', async () => {
    await client.getByPlaceholder('Digite sua mensagem...').fill('Estou no WebChat agora, mesmo protocolo');
    await client.keyboard.press('Enter');
    await agent.getByText('Estou no WebChat agora, mesmo protocolo').waitFor({ timeout: 8000 });
  });

  await step('atendente responde pelo Telegram: entrega confirmada e WebChat atualizado', async () => {
    await sleep(500); // deixa o seletor de canal acompanhar o último canal do cliente
    await agent.getByRole('button', { name: 'Telegram', exact: true }).click();
    await agent.locator('textarea').fill('Vamos verificar o sinal da sua região agora.');
    await agent.keyboard.press('Enter');
    await waitFor(() => lastSent().includes('Vamos verificar o sinal da sua região agora.'), { label: 'entrega no Telegram' });
    await agent.getByText('entregue no Telegram').first().waitFor({ timeout: 8000 });
    await client.getByText('Vamos verificar o sinal da sua região agora.').waitFor({ timeout: 8000 });
  });

  await step('telefone (mock): ligação simulada entra na mesma timeline', async () => {
    await agent.getByRole('button', { name: 'Simular ligação recebida' }).click();
    await agent.getByText(/Ligação simulada/).first().waitFor({ timeout: 8000 });
    await client.getByText(/Ligação simulada/).first().waitFor({ timeout: 8000 });
    await shot(agent, '04-painel-timeline-unificada');
    await shot(client, '05-cliente-timeline-unificada');
  });

  await step('F5 no protocolo mantém a página e a timeline (sessão restaurada)', async () => {
    await agent.reload();
    await agent.getByText('Canais do cliente').waitFor({ timeout: 8000 });
    await agent.getByText('O sinal some por volta das 21h').waitFor();
  });

  await step('atendente encerra e o app do cliente mostra "Protocolo encerrado" na hora', async () => {
    await agent.getByRole('button', { name: 'Encerrar' }).click();
    await client.getByText('Protocolo encerrado').waitFor({ timeout: 8000 });
  });

  await step('servidor reinicia: ao reconectar, o app recupera o que mudou enquanto estava fora', async () => {
    await client.goto(`${CLIENT_URL}/`);
    await client.getByText('Meus Protocolos').waitFor();
    // Com o backend fora do ar, um protocolo novo surge no banco (nenhum evento é emitido)
    const requireBackend = createRequire(path.join(ROOT, 'backend', 'package.json'));
    const { PrismaClient } = requireBackend('@prisma/client');
    await env.restart(async () => {
      const prisma = new PrismaClient({ datasources: { db: { url: env.dbUrl } } });
      const carlos = await prisma.user.findUnique({ where: { email: 'carlos.cliente@email.com' } });
      await prisma.protocol.create({
        data: { protocolNumber: 'CLR-2026-99999', title: 'Criado enquanto o servidor estava fora', clientId: carlos.id, aiStatus: 'OFF' },
      });
      await prisma.$disconnect();
    });
    await client.getByText('CLR-2026-99999').waitFor({ timeout: 30000 });
  });

  await step('cliente abre a configuração opcional de 2FA e o QR Code aparece', async () => {
    await client.goto(`${CLIENT_URL}/security`);
    await client.getByRole('button', { name: 'Ativar 2FA' }).click();
    await client.locator('svg[height="200"]').waitFor({ timeout: 8000 });
    await client.getByRole('button', { name: /Já escaneei/ }).waitFor();
  });

  console.log(`\n✅ ${stepper.passed} verificações de interface passaram. Screenshots em test-results/ui/\n`);
}

async function cleanup() {
  await browser?.close();
  children.forEach((c) => c.kill());
  await env?.stop();
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.log('❌');
    console.error(`\nFalha: ${err.message}\n`);
    await shot(browser?.contexts()[1]?.pages()[0] ?? null, '99-falha-painel').catch(() => {});
    await shot(browser?.contexts()[0]?.pages()[0] ?? null, '99-falha-cliente').catch(() => {});
    await cleanup();
    process.exit(1);
  });
