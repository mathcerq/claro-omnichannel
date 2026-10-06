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

const CHAT_ID = '777000111';
const stepper = createStepper();
const step = stepper.step.bind(stepper);

const lastSent = (fake) => fake.sentTo(CHAT_ID).at(-1)?.text ?? '';

// ── execução ──────────────────────────────────────────────────────────────────
let env;
const sockets = [];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  E2E — Canal Telegram (Bot API fake + backend real)  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  console.log('Preparando backend isolado (porta 3100, banco prisma/e2e.db)...');
  env = await startTestBackend({ port: 3100 });
  const { api, fake, url } = env;
  console.log('Backend de teste no ar.\n');

  // ── Preparação ──
  const carlos = await loginClient(api, 'carlos.cliente@email.com');
  const fernanda = await loginClient(api, 'fernanda.cliente@email.com');
  const agentSecret = await setupStaff2FA(api, 'joao.atendente@claro.com.br');
  const agent = await loginStaff(api, 'joao.atendente@claro.com.br', agentSecret);
  const agentWs = await connectSocket(url, agent);
  const carlosWs = await connectSocket(url, carlos);
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

  await step('atendente não acessa protocolo atribuído a outro atendente (REST e WebSocket)', async () => {
    // CLR-2026-10003 (seed) está atribuído à Maria; o supervisor enxerga todos
    const supervisorSecret = await setupStaff2FA(api, 'supervisor@claro.com.br');
    const supervisor = await loginStaff(api, 'supervisor@claro.com.br', supervisorSecret);
    const { data: everything } = await api('GET', '/protocols', { token: supervisor });
    const mariaProtocol = everything.find((p) => p.protocolNumber === 'CLR-2026-10003');
    assert.ok(mariaProtocol);
    const { status } = await api('GET', `/protocols/${mariaProtocol.id}`, { token: agent });
    assert.equal(status, 403);
    const msg = await api('POST', `/protocols/${mariaProtocol.id}/messages`, { token: agent, body: { content: 'x' } });
    assert.equal(msg.status, 403);
    const ack = await agentWs.socket.timeout(3000).emitWithAck('join_protocol', { protocolId: mariaProtocol.id });
    assert.equal(ack.ok, false);
    // supervisor enxerga tudo
    assert.equal((await api('GET', `/protocols/${mariaProtocol.id}`, { token: supervisor })).status, 200);
  });

  await step('token restrito (setupToken de 2FA) não abre WebSocket', async () => {
    const { data } = await api('POST', '/auth/login', { body: { email: 'maria.atendente@claro.com.br', password: PASSWORD } });
    assert.ok(data.setupToken);
    await assert.rejects(connectSocket(url, data.setupToken));
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
    assert.ok(!env.log.includes(env.fakeToken));
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
    await cleanup();
    process.exit(1);
  });
