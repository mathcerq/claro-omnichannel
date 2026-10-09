import { AssistantAction, ToolDefinition, Toolbox } from './assistant.types';
import {
  getDuplicateInvoice,
  getInvoices,
  getModemDiagnostics,
  getNetworkStatus,
  getPlan,
  rebootModem,
  scheduleTechnicalVisit,
} from './mock-claro-api';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'consultar_faturas',
    description:
      'Consulta as 3 últimas faturas do cliente (valor, vencimento, status) e o plano contratado. Use para dúvidas sobre conta, cobrança ou valor.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'enviar_segunda_via',
    description: 'Gera a segunda via da fatura em aberto (linha digitável) e envia para o e-mail e app do cliente.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'verificar_instabilidade_regiao',
    description: 'Verifica se há falha ou manutenção na rede da região do cliente. Use sempre que a internet/TV estiver com problema.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'diagnosticar_modem',
    description: 'Faz o diagnóstico remoto do modem do cliente: status, quedas nas últimas 24h e potência do sinal óptico.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'reiniciar_modem',
    description: 'Envia um comando remoto de reinício para o modem do cliente. Só use depois de o cliente concordar.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'agendar_visita_tecnica',
    description: 'Agenda visita técnica para o próximo dia útil. Só use depois de o cliente escolher o período.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', description: 'Período escolhido pelo cliente', enum: ['manha', 'tarde'] } },
      required: ['periodo'],
    },
  },
  {
    name: 'transferir_para_atendente',
    description:
      'Transfere o atendimento para um atendente humano. Use se o cliente pedir um humano, para contestação de cobrança, cancelamento, portabilidade, reclamação grave ou quando você não conseguir resolver.',
    parameters: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo curto da transferência' },
        resumo: {
          type: 'string',
          description: 'Resumo do caso para o atendente: problema, o que já foi verificado/feito e o que falta',
        },
        prioridade: { type: 'string', description: 'Prioridade sugerida', enum: ['MEDIUM', 'HIGH', 'URGENT'] },
      },
      required: ['motivo', 'resumo'],
    },
  },
  {
    name: 'concluir_atendimento',
    description: 'Encerra o protocolo como resolvido. Só use depois que o cliente CONFIRMAR que o problema foi resolvido.',
    parameters: {
      type: 'object',
      properties: { resumo: { type: 'string', description: 'Resumo do que foi resolvido' } },
      required: ['resumo'],
    },
  },
];

const PERIODOS = ['manha', 'tarde'];

/** Caixa de ferramentas de um turno: executa as ferramentas para um cliente e guarda a ação final. */
export function createToolbox(clientId: string, protocol: { number: string; status: string }): Toolbox {
  let action: AssistantAction | null = null;
  const used: string[] = [];

  const execute = async (name: string, args: Record<string, unknown> = {}) => {
    used.push(name);
    switch (name) {
      case 'consultar_faturas':
        return { plano: getPlan(clientId), faturas: getInvoices(clientId) };
      case 'enviar_segunda_via':
        return getDuplicateInvoice(clientId);
      case 'verificar_instabilidade_regiao':
        return getNetworkStatus(clientId);
      case 'diagnosticar_modem':
        return getModemDiagnostics(clientId);
      case 'reiniciar_modem':
        return rebootModem();
      case 'agendar_visita_tecnica': {
        const periodo = PERIODOS.includes(String(args.periodo)) ? (args.periodo as 'manha' | 'tarde') : 'manha';
        return scheduleTechnicalVisit(periodo);
      }
      case 'transferir_para_atendente': {
        const priority = ['MEDIUM', 'HIGH', 'URGENT'].includes(String(args.prioridade)) ? String(args.prioridade) : undefined;
        action = {
          type: 'HANDOFF',
          reason: String(args.motivo || 'Transferência solicitada').slice(0, 200),
          summary: String(args.resumo || '').slice(0, 1500),
          priority,
        };
        return { transferido: true, protocolo: protocol.number };
      }
      case 'concluir_atendimento':
        action = { type: 'RESOLVE', summary: String(args.resumo || '').slice(0, 1500) };
        return { encerrado: true, protocolo: protocol.number };
      default:
        throw new Error(`Ferramenta desconhecida: ${name}`);
    }
  };

  return {
    definitions: TOOL_DEFINITIONS,
    execute,
    get action() {
      return action;
    },
    get used() {
      return used;
    },
  };
}
