import { AssistantContext, AssistantDecision, AssistantEngine } from './assistant.types';
import { INTENTS, has, normalize } from './assistant-intents';

/**
 * Travas determinísticas em volta da IA generativa.
 *
 * Modelos locais pequenos às vezes "prometem" uma ação sem chamar a
 * ferramenta, ou deixam de transferir quando deveriam. Regras de negócio
 * críticas não podem depender disso:
 *  - ANTES da IA: pedido de humano, cancelamento, contestação, Procon etc.
 *    sempre vão para um atendente (decisão do código, não do modelo);
 *  - DEPOIS da IA: se ela disse que ia transferir, ou o cliente confirmou que
 *    está resolvido, a ação é executada mesmo que o modelo não a tenha chamado.
 */

const lastUserText = (ctx: AssistantContext) =>
  [...ctx.history].reverse().find((t) => t.role === 'user')?.content ?? '';

/** Assuntos que sempre exigem atendente humano. */
export function mustEscalate(ctx: AssistantContext): boolean {
  const text = normalize(lastUserText(ctx));
  return has(text, ...INTENTS.human) || has(text, ...INTENTS.escalate);
}

/** O cliente confirmou que está resolvido ("funcionou, obrigado") depois de ser atendido. */
export function confirmsResolution(ctx: AssistantContext): boolean {
  const user = normalize(lastUserText(ctx));
  const hadConversation = ctx.history.some((t) => t.role === 'assistant');
  return hadConversation && has(user, ...INTENTS.thanks) && !has(user, ...INTENTS.no) && !user.includes('?');
}

/** Resumo do caso para o atendente: o que o cliente disse e o que já foi verificado. */
export function caseSummary(ctx: AssistantContext): string {
  const said = ctx.history
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .slice(-3)
    .join(' | ');
  const tools = ctx.toolbox.used.filter((t) => t !== 'transferir_para_atendente' && t !== 'concluir_atendimento');
  const checked = tools.length ? ` Verificações já feitas: ${[...new Set(tools)].join(', ')}.` : '';
  return `Assunto: ${ctx.protocolTitle}. Cliente disse: ${said || ctx.protocolTitle}.${checked}`;
}

/**
 * Executa a ação que a IA prometeu no texto mas não chamou.
 * Retorna o nome da trava aplicada (para log/auditoria) ou null.
 */
export async function enforcePromisedActions(ctx: AssistantContext, reply: string): Promise<string | null> {
  if (ctx.toolbox.action) return null;
  const answer = normalize(reply);
  const user = normalize(lastUserText(ctx));

  if (/transfer/.test(answer) && has(answer, 'atendente', 'humano', 'especialista')) {
    await ctx.toolbox.execute('transferir_para_atendente', {
      motivo: 'Transferência indicada pela assistente',
      resumo: caseSummary(ctx),
    });
    return 'transferencia_prometida';
  }

  if (confirmsResolution(ctx)) {
    await ctx.toolbox.execute('concluir_atendimento', { resumo: `Cliente confirmou a resolução. ${caseSummary(ctx)}` });
    return 'resolucao_confirmada';
  }
  return null;
}

/** Um turno da assistente com as travas aplicadas (só fazem sentido para motores LLM). */
export async function respondWithGuardrails(
  engine: AssistantEngine,
  rules: AssistantEngine,
  ctx: AssistantContext,
): Promise<AssistantDecision> {
  // Decisões de negócio claras não esperam a IA (mais rápido e 100% previsível)
  if (engine.kind === 'LLM' && mustEscalate(ctx)) {
    const decision = await rules.respond(ctx);
    return { ...decision, guardrail: 'escalonamento_obrigatorio' };
  }
  if (engine.kind === 'LLM' && confirmsResolution(ctx)) {
    const decision = await rules.respond(ctx);
    if (ctx.toolbox.action?.type === 'RESOLVE') return { ...decision, guardrail: 'resolucao_confirmada' };
  }
  const decision = await engine.respond(ctx);
  if (engine.kind !== 'LLM') return decision;
  const guardrail = await enforcePromisedActions(ctx, decision.reply);
  return guardrail ? { ...decision, toolsUsed: [...ctx.toolbox.used], guardrail } : decision;
}
