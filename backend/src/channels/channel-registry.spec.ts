import { BadRequestException, Logger } from '@nestjs/common';
import { ChannelRegistry } from './channel-registry.service';
import { ChannelAdapter, ChannelCode, ChannelKind } from './channel.types';

function fakeAdapter(code: ChannelCode, kind: ChannelKind, opts: { enabled?: boolean; available?: boolean } = {}): ChannelAdapter {
  return {
    code,
    label: code,
    kind,
    info: () => ({ code, label: code, kind, enabled: opts.enabled ?? true, description: '' }),
    isAvailableFor: async () => opts.available ?? true,
  };
}

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeAll(() => Logger.overrideLogger(false));

  beforeEach(() => {
    registry = new ChannelRegistry();
    registry.register(fakeAdapter('WEBCHAT', 'REAL'));
    registry.register(fakeAdapter('TELEGRAM', 'REAL', { available: false }));
    registry.register(fakeAdapter('PHONE', 'MOCK'));
  });

  it('lista canais reais e mock', () => {
    expect(registry.list().map((c) => [c.code, c.kind])).toEqual([
      ['WEBCHAT', 'REAL'],
      ['TELEGRAM', 'REAL'],
      ['PHONE', 'MOCK'],
    ]);
  });

  it('informa apenas os canais disponíveis para o cliente', async () => {
    expect(await registry.availableFor('cliente-1')).toEqual(['WEBCHAT', 'PHONE']);
  });

  it('recusa resposta por canal em que o cliente não está conectado', async () => {
    await expect(registry.assertAvailableFor('TELEGRAM', 'cliente-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa canal desconhecido ou desligado', async () => {
    registry.register(fakeAdapter('TELEGRAM', 'REAL', { enabled: false }));
    await expect(registry.assertAvailableFor('EMAIL', 'c')).rejects.toBeInstanceOf(BadRequestException);
    await expect(registry.assertAvailableFor('TELEGRAM', 'c')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('um canal novo é plugado só com register(), sem mudar o núcleo', async () => {
    const before = registry.list().length;
    registry.register(fakeAdapter('PHONE', 'REAL')); // ex.: troca do mock por integração real
    expect(registry.list()).toHaveLength(before);
    expect(registry.get('PHONE')?.kind).toBe('REAL');
  });
});
