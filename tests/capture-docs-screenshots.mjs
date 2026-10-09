/**
 * Gera as capturas do PAINEL DO ATENDENTE usadas no README (docs/screenshots).
 *
 * Roda num ambiente de teste isolado (como os e2e): backend na porta 3400,
 * Bot API fake e assistente com o motor de REGRAS — o login de atendente no
 * ambiente real exige o 2FA do celular do dono do projeto.
 *
 * Uso: npm run docs:screenshots
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { ROOT, PASSWORD, authenticator, waitFor, startTestBackend, loginClient, setupStaff2FA } from './helpers.mjs';

const API_PORT = 3400;
const AGENT_PORT = 5373;
const AGENT_URL = `http://localhost:${AGENT_PORT}`;
const CHAT_ID = '424242';
const OUT = path.join(ROOT, 'docs', 'screenshots');
const children = [];
let env;
let browser;

async function main() {
  env = await startTestBackend({
    port: API_PORT,
    dbName: 'docs-screenshots.db',
    corsOrigins: AGENT_URL,
    assistant: 'rules',
    botUsername: 'claro_omnichannel_mathcerq_bot',
  });
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(AGENT_PORT), '--strictPort'], {
    cwd: path.join(ROOT, 'frontend-agent'),
    env: { ...process.env, VITE_API_URL: `http://localhost:${API_PORT}` },
    stdio: 'ignore',
  });
  children.push(vite);
  await waitFor(() => fetch(AGENT_URL).then((r) => r.ok), { timeout: 30000, label: 'painel' });

  const { api, fake } = env;
  const lastSent = () => fake.sentTo(CHAT_ID).at(-1)?.text ?? '';
  const carlos = await loginClient(api, 'carlos.cliente@email.com');

  // Telegram: a IA atende e transfere quando o cliente pede um humano
  const { data: link } = await api('POST', '/channels/telegram/link-code', { token: carlos });
  fake.pushText(CHAT_ID, `/start ${link.code}`);
  await waitFor(() => lastSent().includes('vinculado'), { label: 'vínculo' });
  fake.pushText(CHAT_ID, '/novo Internet caindo à noite');
  await waitFor(() => /CLR-\d{4}-\d{5}/.test(lastSent()), { label: 'protocolo' });
  const handedOff = /CLR-\d{4}-\d{5}/.exec(lastSent())[0];
  fake.pushText(CHAT_ID, 'Minha internet cai toda noite depois das 22h');
  await waitFor(() => lastSent().startsWith('🤖'), { label: 'resposta da IA' });
  fake.pushText(CHAT_ID, 'Já reiniciei várias vezes, quero falar com um atendente');
  await waitFor(() => lastSent().includes('transferir'), { label: 'transferência' });

  // WebChat: a IA resolve sozinha (entra na taxa de resolução)
  const { data: web } = await api('POST', '/protocols', { token: carlos, body: { title: 'Dúvida na fatura do mês' } });
  await waitFor(async () => (await api('GET', `/protocols/${web.id}`, { token: carlos })).data.messages.length > 0, { label: 'IA' });
  await api('POST', `/protocols/${web.id}/messages`, { token: carlos, body: { content: 'Era só isso, obrigado!' } });
  await waitFor(async () => (await api('GET', `/protocols/${web.id}`, { token: carlos })).data.status === 'CLOSED', { label: 'resolvido' });

  // Painel do atendente
  const secret = await setupStaff2FA(api, 'joao.atendente@claro.com.br');
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${AGENT_URL}/login`);
  await page.fill('input[type="email"]', 'joao.atendente@claro.com.br');
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.locator('input[placeholder="000000"]').fill(authenticator.generate(secret));
  await page.click('button[type="submit"]');
  await page.getByText(handedOff).waitFor();
  await page.waitForTimeout(4500); // toasts de boas-vindas somem
  await page.screenshot({ path: path.join(OUT, 'painel-dashboard.png') });

  await page.getByText(handedOff).click();
  await page.getByText('Resumo da IA para o atendente').waitFor();
  await page.waitForTimeout(800);
  // O chat rola até a última mensagem e arrasta a página junto: volta a página e a barra lateral ao topo
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('aside').forEach((a) => (a.scrollTop = 0));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'painel-ia-transferencia.png') });
  console.log('Capturas geradas em docs/screenshots: painel-dashboard.png, painel-ia-transferencia.png');
}

async function cleanup() {
  await browser?.close();
  children.forEach((c) => c.kill());
  await env?.stop();
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.error(`Falha: ${err.message}`);
    await cleanup();
    process.exit(1);
  });
