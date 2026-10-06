import { Injectable, Logger } from '@nestjs/common';
import { ChannelAdapter, ChannelInfo, DeliveryStatus, OutboundMessage } from '../channel.types';

/**
 * ⚠️ CANAL SIMULADO (MOCK) — decisão consciente do projeto.
 *
 * Não há integração com telefonia (URA, PABX, CTI). Quando o atendente
 * "responde por telefone", a mensagem fica registrada na timeline como
 * anotação de ligação e a entrega é marcada como SIMULATED.
 *
 * Para trocar por uma integração real (ex.: Twilio Voice, Amazon Connect),
 * basta implementar outro ChannelAdapter com code 'PHONE' — o núcleo não muda.
 */
@Injectable()
export class PhoneMockAdapter implements ChannelAdapter {
  readonly code = 'PHONE' as const;
  readonly label = 'Telefone';
  readonly kind = 'MOCK' as const;
  private readonly logger = new Logger(PhoneMockAdapter.name);

  info(): ChannelInfo {
    return {
      code: this.code,
      label: this.label,
      kind: this.kind,
      enabled: true,
      description: 'Central telefônica SIMULADA: ligações e dados são inventados (sem integração real)',
    };
  }

  async isAvailableFor(): Promise<boolean> {
    return true;
  }

  async deliver(message: OutboundMessage): Promise<DeliveryStatus> {
    this.logger.log(`[MOCK] Registro de ligação para o protocolo ${message.protocolNumber} (nada foi enviado)`);
    return 'SIMULATED';
  }
}
