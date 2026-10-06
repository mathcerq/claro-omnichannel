import { canAccessProtocol } from './protocol-access';

const protocol = { clientId: 'cliente-1', agentId: 'agente-1' };
const queued = { clientId: 'cliente-1', agentId: null };

describe('canAccessProtocol', () => {
  it('cliente acessa apenas os próprios protocolos', () => {
    expect(canAccessProtocol({ id: 'cliente-1', role: 'CLIENT' }, protocol)).toBe(true);
    expect(canAccessProtocol({ id: 'cliente-2', role: 'CLIENT' }, protocol)).toBe(false);
  });

  it('atendente acessa os atribuídos a ele e os da fila', () => {
    expect(canAccessProtocol({ id: 'agente-1', role: 'AGENT' }, protocol)).toBe(true);
    expect(canAccessProtocol({ id: 'agente-2', role: 'AGENT' }, queued)).toBe(true);
    expect(canAccessProtocol({ id: 'agente-2', role: 'AGENT' }, protocol)).toBe(false);
  });

  it('supervisor e admin acessam todos', () => {
    expect(canAccessProtocol({ id: 'x', role: 'SUPERVISOR' }, protocol)).toBe(true);
    expect(canAccessProtocol({ id: 'y', role: 'ADMIN' }, protocol)).toBe(true);
  });

  it('perfil desconhecido não acessa protocolo de terceiros', () => {
    expect(canAccessProtocol({ id: 'z', role: 'OUTRO' }, protocol)).toBe(false);
  });
});
