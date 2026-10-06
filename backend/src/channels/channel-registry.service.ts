import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, ChannelCode, ChannelInfo } from './channel.types';

/**
 * Registro central dos canais. Cada módulo de canal registra seu adapter no
 * onModuleInit; o núcleo consulta o registro sem conhecer implementações.
 */
@Injectable()
export class ChannelRegistry {
  private readonly logger = new Logger(ChannelRegistry.name);
  private readonly adapters = new Map<ChannelCode, ChannelAdapter>();

  register(adapter: ChannelAdapter) {
    this.adapters.set(adapter.code, adapter);
    this.logger.log(`Canal registrado: ${adapter.code} (${adapter.kind})`);
  }

  get(code: string): ChannelAdapter | undefined {
    return this.adapters.get(code as ChannelCode);
  }

  list(): ChannelInfo[] {
    return [...this.adapters.values()].map((a) => a.info());
  }

  /** Garante que o atendente pode responder ao cliente pelo canal escolhido. */
  async assertAvailableFor(code: string, clientId: string) {
    const adapter = this.get(code);
    if (!adapter || !adapter.info().enabled) {
      throw new BadRequestException(`Canal ${code} indisponível`);
    }
    if (!(await adapter.isAvailableFor(clientId))) {
      throw new BadRequestException(
        `O cliente não está conectado ao canal ${adapter.label}. Responda por outro canal.`,
      );
    }
  }

  /** Canais pelos quais o atendente consegue falar com este cliente agora. */
  async availableFor(clientId: string): Promise<ChannelCode[]> {
    const result: ChannelCode[] = [];
    for (const adapter of this.adapters.values()) {
      if (adapter.info().enabled && (await adapter.isAvailableFor(clientId))) {
        result.push(adapter.code);
      }
    }
    return result;
  }
}
