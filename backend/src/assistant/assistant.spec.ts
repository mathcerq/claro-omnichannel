import { ConfigService } from '@nestjs/config';
import { RulesEngine } from './engines/rules.engine';
import { OllamaEngine, cleanReply } from './engines/ollama.engine';
import { createToolbox } from './assistant-tools';
import { getInvoices, getNetworkStatus } from './mock-claro-api';
import { AssistantContext, ConversationTurn } from './assistant.types';

const PROTOCOL = { number: 'CLR-2026-12345', status: 'OPEN' };

function ctx(history: ConversationTurn[], clientId = 'cliente-1'): AssistantContext {
  return {
    protocolNumber: PROTOCOL.number,
    protocolTitle: 'Internet caindo',
    protocolStatus: 'OPEN',
    customerFirstName: 'Carlos',
    history,
    toolbox: createToolbox(clientId, PROTOCOL),
  };
}

/** Acha um cliente fictício cujo mock tem a característica desejada. */
function clientWhere(predicate: (id: string) => boolean) {
  for (let i = 0; i < 500; i++) if (predicate(`cliente-${i}`)) return `cliente-${i}`;
  throw new Error('nenhum cliente encontrado');
}

describe('dados simulados da Claro (mock)', () => {
  it('são determinísticos por cliente', () => {
    expect(getInvoices('abc')).toEqual(getInvoices('abc'));
    expect(getNetworkStatus('abc').regiao).toBe(getNetworkStatus('abc').regiao);
  });
});

describe('RulesEngine (reserva sem IA generativa)', () => {
  const engine = new RulesEngine();

  it('se apresenta como assistente virtual na primeira resposta', async () => {
    const decision = await engine.respond(ctx([{ role: 'user', content: 'oi' }]));
    expect(decision.reply).toContain('assistente virtual');
    expect(decision.reply).toContain('atendente');
  });

  it('transfere imediatamente quando o cliente pede um humano', async () => {
    const c = ctx([{ role: 'user', content: 'Quero falar com um atendente' }]);
    await engine.respond(c);
    expect(c.toolbox.action).toMatchObject({ type: 'HANDOFF', reason: 'Cliente pediu atendimento humano' });
  });

  it('transfere com prioridade alta em cancelamento e urgente com Procon', async () => {
    const cancel = ctx([{ role: 'user', content: 'quero cancelar meu plano' }]);
    await engine.respond(cancel);
    expect(cancel.toolbox.action).toMatchObject({ type: 'HANDOFF', priority: 'HIGH' });

    const procon = ctx([{ role: 'user', content: 'vou no procon se não resolver' }]);
    await engine.respond(procon);
    expect(procon.toolbox.action).toMatchObject({ type: 'HANDOFF', priority: 'URGENT' });
  });

  it('consulta a fatura usando a ferramenta', async () => {
    const c = ctx([{ role: 'user', content: 'qual o valor da minha fatura?' }]);
    const decision = await engine.respond(c);
    expect(decision.toolsUsed).toContain('consultar_faturas');
    expect(decision.reply).toMatch(/R\$ \d+,\d{2}/);
  });

  it('internet: reinicia o modem, confirma com o cliente e encerra como resolvido', async () => {
    const id = clientWhere((c) => getNetworkStatus(c).status === 'NORMAL' && !require('./mock-claro-api').getModemDiagnostics(c).sinalFraco);
    const first = ctx([{ role: 'user', content: 'minha internet está caindo' }], id);
    const r1 = await engine.respond(first);
    expect(r1.toolsUsed).toEqual(['verificar_instabilidade_regiao', 'diagnosticar_modem']);
    expect(r1.reply).toContain('reiniciar o seu modem');

    const history: ConversationTurn[] = [
      { role: 'user', content: 'minha internet está caindo' },
      { role: 'assistant', content: r1.reply },
      { role: 'user', content: 'sim, pode reiniciar' },
    ];
    const r2 = await engine.respond(ctx(history, id));
    expect(r2.toolsUsed).toEqual(['reiniciar_modem']);

    const c3 = ctx([...history, { role: 'assistant', content: r2.reply }, { role: 'user', content: 'funcionou, obrigado!' }], id);
    await engine.respond(c3);
    expect(c3.toolbox.action).toMatchObject({ type: 'RESOLVE' });
  });

  it('instabilidade na região: informa a previsão sem mexer no modem', async () => {
    const id = clientWhere((c) => getNetworkStatus(c).status === 'INSTABILIDADE');
    const decision = await engine.respond(ctx([{ role: 'user', content: 'internet lenta' }], id));
    expect(decision.reply).toContain('instabilidade');
    expect(decision.toolsUsed).not.toContain('reiniciar_modem');
  });

  it('agenda visita quando o cliente escolhe o período', async () => {
    const c = ctx([
      { role: 'user', content: 'preciso de um técnico' },
      { role: 'assistant', content: 'Posso agendar uma visita técnica. Prefere manhã ou tarde?' },
      { role: 'user', content: 'de tarde' },
    ]);
    const decision = await engine.respond(c);
    expect(decision.toolsUsed).toEqual(['agendar_visita_tecnica']);
    expect(decision.reply).toMatch(/VT-\d{6}/);
    expect(decision.reply).toContain('13h às 18h');
  });

  it('transfere depois de não entender duas vezes seguidas', async () => {
    const c = ctx([
      { role: 'user', content: 'xpto' },
      { role: 'assistant', content: 'Não consegui entender direito. Posso ajudar com...' },
      { role: 'user', content: 'blablabla' },
    ]);
    await engine.respond(c);
    expect(c.toolbox.action?.type).toBe('HANDOFF');
  });
});

describe('OllamaEngine (LLM local)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const engine = () => new OllamaEngine(new ConfigService({ OLLAMA_MODEL: 'modelo-teste', OLLAMA_URL: 'http://ollama.local' }));
  const reply = (message: unknown) => ({ ok: true, json: async () => ({ message }) });

  it('executa as ferramentas pedidas pelo modelo e devolve a resposta final', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(reply({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'consultar_faturas', arguments: {} } }] }))
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Sua fatura é de **R$ 99,90**.' }));
    global.fetch = fetchMock;

    const c = ctx([{ role: 'user', content: 'valor da fatura?' }]);
    const decision = await engine().respond(c);

    expect(decision.reply).toBe('Sua fatura é de R$ 99,90.');
    expect(decision.toolsUsed).toEqual(['consultar_faturas']);
    const secondCall = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCall.messages.at(-1)).toMatchObject({ role: 'tool', tool_name: 'consultar_faturas' });
    expect(secondCall.messages[0].content).toContain('Cliente: Carlos');
  });

  it('a transferência pedida pelo modelo vira ação de HANDOFF', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        reply({
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'transferir_para_atendente', arguments: '{"motivo":"Cancelamento","resumo":"Cliente quer cancelar"}' } }],
        }),
      )
      .mockResolvedValueOnce(reply({ role: 'assistant', content: 'Vou transferir você.' }));
    const c = ctx([{ role: 'user', content: 'quero cancelar' }]);
    await engine().respond(c);
    expect(c.toolbox.action).toEqual({ type: 'HANDOFF', reason: 'Cancelamento', summary: 'Cliente quer cancelar', priority: undefined });
  });

  it('fica indisponível se o Ollama não responde ou o modelo não foi baixado', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await engine().isAvailable()).toBe(false);

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [{ name: 'outro:7b' }] }) });
    expect(await engine().isAvailable()).toBe(false);
  });

  it('cleanReply remove markdown e blocos de raciocínio', () => {
    expect(cleanReply('<think>pensando</think>## Olá\n**Tudo certo**')).toBe('Olá\nTudo certo');
  });
});
