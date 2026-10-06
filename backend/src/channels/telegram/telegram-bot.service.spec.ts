import { ConfigService } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramUpdate } from './telegram.types';

const CHAT = 4242;

function update(text: string, chatType: 'private' | 'group' = 'private', messageId = 1): TelegramUpdate {
  return {
    update_id: 1,
    message: { message_id: messageId, date: 0, chat: { id: CHAT, type: chatType }, text },
  };
}

function protocol(id: string, status = 'OPEN') {
  return {
    id,
    protocolNumber: `CLR-2026-${id.padStart(5, '0')}`,
    title: `Protocolo ${id}`,
    status,
    currentChannel: 'WEBCHAT',
    agent: null,
    _count: { messages: 0 },
  };
}

function setup(identity: any = null) {
  const api = { sendMessage: jest.fn().mockResolvedValue({}) };
  const links = {
    findByChat: jest.fn().mockResolvedValue(identity),
    consumeCode: jest.fn(),
    setActiveProtocol: jest.fn().mockResolvedValue({}),
    unlinkUser: jest.fn().mockResolvedValue(true),
  };
  const protocols = {
    create: jest.fn().mockImplementation(async (_u, dto) => ({ ...protocol('99'), title: dto.title })),
    findForClient: jest.fn().mockResolvedValue(null),
    listOpenForClient: jest.fn().mockResolvedValue([]),
  };
  const messages = { createInbound: jest.fn().mockResolvedValue({}), findRecent: jest.fn().mockResolvedValue([]) };
  const bot = new TelegramBotService(api as any, links as any, protocols as any, messages as any, new ConfigService({}));
  const lastReply = () => api.sendMessage.mock.calls.at(-1)?.[1] as string;
  return { bot, api, links, protocols, messages, lastReply };
}

const linkedIdentity = (activeProtocolId: string | null = null) => ({
  id: 'ident-1',
  externalId: String(CHAT),
  userId: 'user-1',
  activeProtocolId,
  user: { id: 'user-1', name: 'Carlos Silva', role: 'CLIENT', isActive: true },
});

describe('TelegramBotService', () => {
  it('chat não vinculado recebe instruções e nada é gravado', async () => {
    const t = setup(null);
    await t.bot.handleUpdate(update('olá'));
    expect(t.lastReply()).toContain('vincule sua conta');
    expect(t.messages.createInbound).not.toHaveBeenCalled();
  });

  it('recusa conversas em grupo', async () => {
    const t = setup(linkedIdentity());
    await t.bot.handleUpdate(update('olá', 'group'));
    expect(t.lastReply()).toContain('conversa privada');
    expect(t.links.findByChat).not.toHaveBeenCalled();
  });

  it('sem protocolo aberto: cria um novo com canal TELEGRAM e registra a mensagem', async () => {
    const t = setup(linkedIdentity());
    await t.bot.handleUpdate(update('Minha internet não conecta desde ontem', 'private', 77));

    expect(t.protocols.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ title: 'Minha internet não conecta desde ontem' }),
      'TELEGRAM',
    );
    expect(t.messages.createInbound).toHaveBeenCalledWith(
      expect.objectContaining({ protocolId: '99', channel: 'TELEGRAM', externalId: `${CHAT}:77` }),
    );
    expect(t.links.setActiveProtocol).toHaveBeenCalledWith('ident-1', '99');
    expect(t.lastReply()).toContain('Abrimos o protocolo CLR-2026-00099');
  });

  it('com protocolo ativo em aberto: reaproveita sem avisar a cada mensagem', async () => {
    const t = setup(linkedIdentity('5'));
    t.protocols.findForClient.mockResolvedValue(protocol('5', 'IN_PROGRESS'));
    await t.bot.handleUpdate(update('Mais detalhes do problema'));

    expect(t.protocols.create).not.toHaveBeenCalled();
    expect(t.messages.createInbound).toHaveBeenCalledWith(expect.objectContaining({ protocolId: '5' }));
    expect(t.api.sendMessage).not.toHaveBeenCalled();
  });

  it('protocolo ativo encerrado: reaproveita o aberto mais recente e avisa', async () => {
    const t = setup(linkedIdentity('5'));
    t.protocols.findForClient.mockResolvedValue(protocol('5', 'CLOSED'));
    t.protocols.listOpenForClient.mockResolvedValue([protocol('8', 'WAITING')]);
    await t.bot.handleUpdate(update('Voltei'));

    expect(t.messages.createInbound).toHaveBeenCalledWith(expect.objectContaining({ protocolId: '8' }));
    expect(t.links.setActiveProtocol).toHaveBeenCalledWith('ident-1', '8');
    expect(t.lastReply()).toContain('Mensagem registrada no protocolo CLR-2026-00008');
  });

  it('/usar não permite selecionar protocolo encerrado', async () => {
    const t = setup(linkedIdentity());
    t.protocols.findForClient.mockResolvedValue(protocol('3', 'CLOSED'));
    await t.bot.handleUpdate(update('/usar CLR-2026-00003'));
    expect(t.links.setActiveProtocol).not.toHaveBeenCalled();
    expect(t.lastReply()).toContain('encerrado');
  });

  it('/desvincular remove o vínculo', async () => {
    const t = setup(linkedIdentity());
    await t.bot.handleUpdate(update('/desvincular'));
    expect(t.links.unlinkUser).toHaveBeenCalledWith('user-1');
    expect(t.lastReply()).toContain('desvinculado');
  });

  it('limita mensagens em excesso por minuto', async () => {
    const t = setup(linkedIdentity('5'));
    t.protocols.findForClient.mockResolvedValue(protocol('5'));
    for (let i = 0; i < 21; i++) await t.bot.handleUpdate(update(`msg ${i}`, 'private', i));
    expect(t.messages.createInbound).toHaveBeenCalledTimes(20);
    expect(t.lastReply()).toContain('muitas mensagens');
  });
});
