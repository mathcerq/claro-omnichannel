/** Contratos da assistente virtual (IA de atendimento nível 1). */

export type AiStatus = 'ACTIVE' | 'HANDED_OFF' | 'RESOLVED' | 'HUMAN' | 'OFF';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantContext {
  protocolNumber: string;
  protocolTitle: string;
  protocolStatus: string;
  /** Só o primeiro nome vai para a IA (minimização de dados — LGPD) */
  customerFirstName: string;
  history: ConversationTurn[];
  toolbox: Toolbox;
}

export type AssistantAction =
  | { type: 'HANDOFF'; reason: string; summary: string; priority?: string }
  | { type: 'RESOLVE'; summary: string };

export interface AssistantDecision {
  reply: string;
  engine: string;
  toolsUsed: string[];
  /** Trava determinística aplicada neste turno, se houver */
  guardrail?: string;
}

/**
 * Motor de IA plugável (mesmo padrão dos canais). Implementações:
 *  - OllamaEngine: LLM local e gratuito (padrão)
 *  - RulesEngine: regras por palavras-chave (reserva, sem IA generativa)
 * Um motor pago (ex.: API do Claude) entraria aqui sem mudar o resto.
 */
export interface AssistantEngine {
  readonly name: string;
  readonly kind: 'LLM' | 'RULES';
  isAvailable(): Promise<boolean>;
  respond(ctx: AssistantContext): Promise<AssistantDecision>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export interface Toolbox {
  definitions: ToolDefinition[];
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Ação final decidida pela IA (transferir ou concluir), se houver */
  readonly action: AssistantAction | null;
  readonly used: string[];
}
