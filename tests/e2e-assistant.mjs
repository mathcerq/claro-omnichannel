/**
 * Teste E2E da assistente virtual (IA nível 1) integrada aos canais.
 *
 * Usa o motor de REGRAS (determinístico e instantâneo) para validar a
 * integração: resposta na mesma timeline, entrega no Telegram e no WebChat,
 * transferência para humano com resumo, resolução sem humano, saída da IA
 * quando o atendente assume e métricas. A qualidade da IA real (Ollama) é
 * avaliada à parte em backend/scripts/assistant-scenarios.ts.
 *
 * Uso: npm run test:e2e:assistant   (não precisa de servidores rodando)
 */
import assert from 'node:assert/strict';
import {
  PASSWORD,
  sleep,
  waitFor,
  createStepper,
  startTestBackend,
  loginClient,
  setupStaff2FA,
  loginStaff,
  connectSocket,
} from './helpers.mjs';

const CHAT_ID = '999000333';
const stepper = createStepper();
const step = stepper.step.bind(stepper);
let env;
const sockets = [];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  E2E — Assistente virtual (IA nível 1)               ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  env = await startTestBackend({ port: 3300, dbName: 'e2e-assistant.db', assistant: 'rules' });
  const { api, fake, url } = env;
  const lastSent = () => fake.sentTo(CHAT_ID).at(-1)?.text ?? '';
  const protocolOf = async (token, id) => (await api('GET', `/protocols/${id}`, { token })).data;

  const carlos = await loginClient(api, 'carlos.cliente@email.com');
  const secret = await setupStaff2FA(api, 'joao.atendente@claro.com.br');
  const agent = await loginStaff(api, 'joao.atendente@claro.com.br', secret);
  const agentWs = await connectSocket(url, agent);
  sockets.push(agentWs.socket);

  // Vincula o Telegram do Carlos
  const { data: link } = await api('POST', '/channels/telegram/link-code', { token: carlos });
  fake.pushText(CHAT_ID, `/start ${link.code}`);
  await waitFor(() => lastSent().includes('vinculado'), { label: 'vínculo' });

  console.log('[Status]');
  await step('GET /assistant/status informa o motor em uso', async () => {
    const { data } = await api('GET', '/assistant/status', { token: agent });
    assert.equal(data.enabled, true);
    assert.equal(data.engine, 'regras');
  });

  console.log('\n[Telegram]');
  let telegramProtocol;
  await step('cliente descreve o problema e a IA responde no Telegram, identificada como assistente', async () => {
    fake.pushText(CHAT_ID, '/novo Internet caindo à noite');
    await waitFor(() => /CLR-\d{4}-\d{5}/.test(lastSent()), { label: 'protocolo' });
    const number = /CLR-\d{4}-\d{5}/.exec(lastSent())[0];
    const { data: list } = await api('GET', '/protocols', { token: carlos });
    telegramProtocol = list.find((p) => p.protocolNumber === number);
    assert.equal(telegramProtocol.aiStatus, 'ACTIVE');

    agentWs.socket.emit('join_protocol', { protocolId: telegramProtocol.id });
    fake.pushText(CHAT_ID, 'Minha internet cai toda noite');
    await waitFor(() => lastSent().startsWith('🤖 Clara (assistente virtual)'), { label: 'resposta da IA no Telegram' });
    assert.equal(lastSent().split('assistente virtual').length - 1, 1, 'IA deve se identificar uma única vez');
    assert.match(lastSent(), /pedir um atendente/);
    assert.match(lastSent(), /região|modem/);
  });

  await step('resposta da IA aparece no painel ao vivo (senderRole BOT) com o "digitando"', async () => {
    const evt = await waitFor(() => agentWs.events.find((e) => e.event === 'new_message' && e.payload.senderRole === 'BOT'), {
      label: 'mensagem BOT no painel',
    });
    assert.equal(evt.payload.channel, 'TELEGRAM');
    assert.ok(agentWs.events.some((e) => e.event === 'assistant_typing' && e.payload.typing === true));
    const detail = await protocolOf(agent, telegramProtocol.id);
    assert.ok(detail.messages.some((m) => m.senderRole === 'BOT' && m.deliveryStatus === 'SENT'));
  });

  await step('pedido de atendente: IA transfere com motivo e resumo do caso', async () => {
    fake.pushText(CHAT_ID, 'Quero falar com um atendente');
    await waitFor(async () => (await protocolOf(agent, telegramProtocol.id)).aiStatus === 'HANDED_OFF', { label: 'transferência' });
    const detail = await protocolOf(agent, telegramProtocol.id);
    assert.equal(detail.aiHandoffReason, 'Cliente pediu atendimento humano');
    assert.match(detail.aiSummary, /Minha internet cai toda noite/);
    assert.match(lastSent(), /transferir você para um atendente/);
  });

  await step('depois da transferência, a IA não responde mais (aguarda o humano)', async () => {
    const before = fake.sentTo(CHAT_ID).length;
    fake.pushText(CHAT_ID, 'Alô? Tem alguém aí?');
    await sleep(1200);
    assert.equal(fake.sentTo(CHAT_ID).length, before);
  });

  await step('atendente assume: status HUMAN e responde normalmente pelo Telegram', async () => {
    await api('PATCH', `/protocols/${telegramProtocol.id}/assign`, { token: agent, body: {} });
    await waitFor(async () => (await protocolOf(agent, telegramProtocol.id)).aiStatus === 'HUMAN', { label: 'HUMAN' });
    await api('POST', `/protocols/${telegramProtocol.id}/messages`, {
      token: agent,
      body: { content: 'Oi Carlos, aqui é o João. Já vi o resumo da Clara.', channel: 'TELEGRAM' },
    });
    await waitFor(() => lastSent().includes('Já vi o resumo da Clara'), { label: 'resposta humana' });
  });

  console.log('\n[WebChat]');
  let webProtocol;
  await step('chamado aberto pelo app: a IA cumprimenta e já consulta a fatura', async () => {
    const { data } = await api('POST', '/protocols', { token: carlos, body: { title: 'Dúvida na fatura do mês' } });
    webProtocol = data;
    const detail = await waitFor(
      async () => {
        const d = await protocolOf(carlos, webProtocol.id);
        return d.messages.some((m) => m.senderRole === 'BOT') && d;
      },
      { label: 'saudação da IA' },
    );
    const bot = detail.messages.find((m) => m.senderRole === 'BOT');
    assert.equal(bot.channel, 'WEBCHAT');
    assert.match(bot.content, /R\$ \d+,\d{2}/);
  });

  await step('cliente confirma que resolveu: protocolo encerrado pela IA (sem humano)', async () => {
    await api('POST', `/protocols/${webProtocol.id}/messages`, { token: carlos, body: { content: 'Era só isso, obrigado!' } });
    const detail = await waitFor(
      async () => {
        const d = await protocolOf(carlos, webProtocol.id);
        return d.status === 'CLOSED' && d;
      },
      { label: 'encerramento' },
    );
    assert.equal(detail.aiStatus, 'RESOLVED');
  });

  await step('mensagem de atendente em protocolo com a IA faz a IA sair', async () => {
    const { data } = await api('POST', '/protocols', { token: carlos, body: { title: 'Internet lenta no quarto' } });
    await waitFor(async () => (await protocolOf(carlos, data.id)).messages.length > 0, { label: 'saudação' });
    await api('POST', `/protocols/${data.id}/messages`, { token: agent, body: { content: 'Assumindo daqui.' } });
    await waitFor(async () => (await protocolOf(agent, data.id)).aiStatus === 'HUMAN', { label: 'HUMAN' });
  });

  await step('ligação simulada (telefone mock) não aciona a IA', async () => {
    const { data } = await api('POST', '/protocols', { token: carlos, body: { title: 'Teste de ligação' } });
    await waitFor(async () => (await protocolOf(carlos, data.id)).messages.length === 1, { label: 'saudação' });
    await api('POST', '/channels/phone/mock-call', { token: agent, body: { protocolId: data.id } });
    await sleep(800);
    const detail = await protocolOf(agent, data.id);
    assert.equal(detail.messages.filter((m) => m.senderRole === 'BOT').length, 1);
    assert.equal(detail.aiStatus, 'ACTIVE');
  });

  console.log('\n[Métricas e segurança]');
  await step('dashboard: protocolos resolvidos e transferidos pela IA', async () => {
    const { data } = await api('GET', '/protocols/stats', { token: agent });
    assert.equal(data.ai.resolved, 1);
    assert.equal(data.ai.handedOff, 1);
    assert.equal(data.ai.resolutionRate, 50);
  });

  await step('a conta da assistente virtual não faz login', async () => {
    const { status } = await api('POST', '/auth/login', { body: { email: 'assistente.virtual@claro.com.br', password: PASSWORD } });
    assert.equal(status, 401);
  });

  console.log(`\n✅ ${stepper.passed} verificações passaram.\n`);
}

async function cleanup() {
  sockets.forEach((s) => s.disconnect());
  await env?.stop();
}

main()
  .then(cleanup)
  .catch(async (err) => {
    console.log('❌');
    console.error(`\nFalha: ${err.message}\n`);
    if (env) console.error(env.log.split('\n').filter((l) => /Assistente|ERROR|Error/.test(l)).slice(-10).join('\n'));
    await cleanup();
    process.exit(1);
  });
