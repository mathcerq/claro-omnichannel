export const STAFF_ROLES = ['AGENT', 'SUPERVISOR', 'ADMIN'];

interface Actor {
  id: string;
  role: string;
}

interface ProtocolOwnership {
  clientId: string;
  agentId: string | null;
}

/**
 * Regra única de acesso a um protocolo (princípio da necessidade — LGPD art. 6º, III):
 *  - ADMIN/SUPERVISOR: todos os protocolos
 *  - AGENT: os atribuídos a ele e os sem atendente (fila)
 *  - CLIENT: apenas os próprios
 */
export function canAccessProtocol(actor: Actor, protocol: ProtocolOwnership): boolean {
  switch (actor.role) {
    case 'ADMIN':
    case 'SUPERVISOR':
      return true;
    case 'AGENT':
      return protocol.agentId === null || protocol.agentId === actor.id;
    default:
      return protocol.clientId === actor.id;
  }
}
