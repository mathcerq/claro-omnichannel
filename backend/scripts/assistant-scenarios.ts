/**
 * Roda conversas de exemplo contra a IA LOCAL (Ollama) e mostra as respostas,
 * as ferramentas usadas e a decisão final. Serve para avaliar/ajustar o prompt.
 *
 * Uso (na pasta backend, com o Ollama rodando):
 *   npx ts-node scripts/assistant-scenarios.ts            # todos os cenários
 *   npx ts-node scripts/assistant-scenarios.ts fatura     # só os que contêm "fatura"
 */
import '../src/config/load-env';
import { ConfigService } from '@nestjs/config';
import { OllamaEngine } from '../src/assistant/engines/ollama.engine';
import { RulesEngine } from '../src/assistant/engines/rules.engine';
import { respondWithGuardrails } from '../src/assistant/assistant-guardrails';
import { createToolbox } from '../src/assistant/assistant-tools';
import { ConversationTurn } from '../src/assistant/assistant.types';

interface Scenario {
  name: string;
  clientId: string;
  title: string;
  /** Falas do cliente, uma por turno */
  userTurns: string[];
  /** Ação esperada no fim (para conferência rápida) */
  expect: 'HANDOFF' | 'RESOLVE' | 'NONE';
}

const SCENARIOS: Scenario[] = [
  {
    name: 'fatura e segunda via',
    clientId: 'cliente-2',
    title: 'Dúvida na fatura',
    userTurns: ['Oi, quanto está minha fatura deste mês?', 'Pode me mandar a segunda via?', 'Era só isso, obrigado!'],
    expect: 'RESOLVE',
  },
  {
    name: 'internet caindo (reinício remoto)',
    clientId: 'cliente-4',
    title: 'Internet caindo à noite',
    userTurns: ['Minha internet cai toda noite depois das 22h', 'Pode reiniciar sim', 'Agora voltou a funcionar, valeu!'],
    expect: 'RESOLVE',
  },
  {
    name: 'pedido de humano',
    clientId: 'cliente-5',
    title: 'Atendimento',
    userTurns: ['Quero falar com um atendente de verdade'],
    expect: 'HANDOFF',
  },
  {
    name: 'contestação de cobrança',
    clientId: 'cliente-0',
    title: 'Cobrança indevida',
    userTurns: ['Minha fatura veio mais cara, quero contestar essa cobrança de streaming que eu nunca contratei'],
    expect: 'HANDOFF',
  },
];

async function main() {
  const engine = new OllamaEngine(new ConfigService(process.env));
  const rules = new RulesEngine();
  const guarded = process.env.SEM_TRAVAS !== '1';
  if (!(await engine.isAvailable())) {
    console.error(`Ollama indisponível ou modelo não baixado (${engine.name}). Rode: ollama pull <modelo>`);
    process.exit(1);
  }
  const filter = process.argv[2]?.toLowerCase();
  let ok = 0;
  const selected = SCENARIOS.filter((s) => !filter || s.name.includes(filter));

  for (const scenario of selected) {
    console.log(`\n━━━ ${scenario.name} (${engine.name}) ━━━`);
    const history: ConversationTurn[] = [];
    const toolbox = createToolbox(scenario.clientId, { number: 'CLR-2026-77777', status: 'OPEN' });

    for (const text of scenario.userTurns) {
      if (toolbox.action) break;
      history.push({ role: 'user', content: text });
      console.log(`\n👤 ${text}`);
      const before = toolbox.used.length;
      const started = Date.now();
      const context = {
        protocolNumber: 'CLR-2026-77777',
        protocolTitle: scenario.title,
        protocolStatus: 'OPEN',
        customerFirstName: 'Carlos',
        history,
        toolbox,
      };
      const decision = guarded ? await respondWithGuardrails(engine, rules, context) : await engine.respond(context);
      const tools = toolbox.used.slice(before);
      console.log(`🤖 ${decision.reply}`);
      console.log(`   ⏱ ${((Date.now() - started) / 1000).toFixed(1)}s${tools.length ? ` · ferramentas: ${tools.join(', ')}` : ''}${decision.guardrail ? ` · trava: ${decision.guardrail}` : ''}`);
      history.push({ role: 'assistant', content: decision.reply });
    }

    const got = toolbox.action?.type ?? 'NONE';
    const pass = got === scenario.expect;
    if (pass) ok++;
    console.log(`\n   Resultado: ${got}${toolbox.action?.type === 'HANDOFF' ? ` — ${toolbox.action.reason}` : ''} ${pass ? '✅' : `❌ (esperado ${scenario.expect})`}`);
    if (toolbox.action) console.log(`   Resumo: ${toolbox.action.summary}`);
  }
  console.log(`\n${ok}/${selected.length} cenários com o desfecho esperado.`);
}

main();
