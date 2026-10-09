import { respondWithGuardrails, enforcePromisedActions } from './assistant-guardrails';
import { createToolbox } from './assistant-tools';
import { RulesEngine } from './engines/rules.engine';
import { AssistantContext, AssistantEngine, ConversationTurn } from './assistant.types';

function ctx(history: ConversationTurn[]): AssistantContext {
  return {
    protocolNumber: 'CLR-2026-12345',
    protocolTitle: 'Internet caindo',
    protocolStatus: 'OPEN',
    customerFirstName: 'Carlos',
    history,
    toolbox: createToolbox('cliente-1', { number: 'CLR-2026-12345', status: 'OPEN' }),
  };
}

/** LLM falso que só responde texto (nunca chama ferramentas). */
const llm = (reply: string): AssistantEngine & { calls: number } => {
  const engine = {
    name: 'llm-falso',
    kind: 'LLM' as const,
    calls: 0,
    isAvailable: async () => true,
    respond: async (c: AssistantContext) => {
      engine.calls++;
      return { reply, engine: 'llm-falso', toolsUsed: [...c.toolbox.used] };
    },
  };
  return engine;
};

describe('travas da IA', () => {
  const rules = new RulesEngine();

  it('pedido de humano transfere sem nem consultar a IA', async () => {
    const engine = llm('Claro, posso ajudar!');
    const c = ctx([{ role: 'user', content: 'quero falar com um humano' }]);
    const decision = await respondWithGuardrails(engine, rules, c);
    expect(engine.calls).toBe(0);
    expect(decision.guardrail).toBe('escalonamento_obrigatorio');
    expect(c.toolbox.action?.type).toBe('HANDOFF');
  });

  it('confirmação de resolução encerra sem esperar a IA', async () => {
    const engine = llm('Até mais!');
    const c = ctx([
      { role: 'user', content: 'internet caindo' },
      { role: 'assistant', content: 'Reiniciei o modem. Pode testar?' },
      { role: 'user', content: 'voltou a funcionar, obrigado' },
    ]);
    const decision = await respondWithGuardrails(engine, rules, c);
    expect(engine.calls).toBe(0);
    expect(decision.guardrail).toBe('resolucao_confirmada');
    expect(c.toolbox.action?.type).toBe('RESOLVE');
  });

  it('"obrigado, mas continua caindo" não encerra', async () => {
    const engine = llm('Sinto muito, vamos agendar uma visita.');
    const c = ctx([
      { role: 'user', content: 'internet caindo' },
      { role: 'assistant', content: 'Reiniciei o modem. Pode testar?' },
      { role: 'user', content: 'obrigado, mas continua caindo' },
    ]);
    await respondWithGuardrails(engine, rules, c);
    expect(engine.calls).toBe(1);
    expect(c.toolbox.action).toBeNull();
  });

  it('IA que promete transferir sem chamar a ferramenta: o sistema transfere', async () => {
    const c = ctx([{ role: 'user', content: 'minha conta está errada há 3 meses' }]);
    const decision = await respondWithGuardrails(llm('Vou transferir você para um atendente humano.'), rules, c);
    expect(decision.guardrail).toBe('transferencia_prometida');
    expect(c.toolbox.action).toMatchObject({ type: 'HANDOFF' });
    expect((c.toolbox.action as any).summary).toContain('minha conta está errada');
  });

  it('não interfere quando a IA já executou a ação', async () => {
    const c = ctx([{ role: 'user', content: 'x' }]);
    await c.toolbox.execute('concluir_atendimento', { resumo: 'ok' });
    expect(await enforcePromisedActions(c, 'vou transferir para um atendente')).toBeNull();
  });
});

describe('resumo do caso para o atendente', () => {
  it('inclui o que o cliente disse e a última orientação da IA (sem o lembrete padrão)', async () => {
    const c = ctx([
      { role: 'user', content: 'internet caindo toda noite' },
      {
        role: 'assistant',
        content: 'Sinal fraco no modem (-27,8 dBm). Precisa de visita técnica.\n\nSe preferir, é só pedir um atendente a qualquer momento.',
      },
      { role: 'user', content: 'quero falar com um atendente' },
    ]);
    await respondWithGuardrails(llm('não usado'), new RulesEngine(), c);
    const summary = (c.toolbox.action as any).summary as string;
    expect(summary).toContain('internet caindo toda noite');
    expect(summary).toContain('Última orientação da assistente: "Sinal fraco no modem (-27,8 dBm). Precisa de visita técnica."');
    expect(summary).not.toContain('Se preferir');
  });
});
