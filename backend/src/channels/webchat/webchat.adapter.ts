import { Injectable } from '@nestjs/common';
import { ChannelAdapter, ChannelInfo } from '../channel.types';

/**
 * WebChat (PWA do cliente). Canal real: a entrega é o próprio WebSocket
 * (EventsGateway), por isso não há deliver().
 */
@Injectable()
export class WebchatAdapter implements ChannelAdapter {
  readonly code = 'WEBCHAT' as const;
  readonly label = 'WebChat';
  readonly kind = 'REAL' as const;

  info(): ChannelInfo {
    return {
      code: this.code,
      label: this.label,
      kind: this.kind,
      enabled: true,
      description: 'Chat no app do cliente (PWA), em tempo real via WebSocket',
    };
  }

  async isAvailableFor(): Promise<boolean> {
    return true; // todo cliente tem acesso ao WebChat
  }
}
