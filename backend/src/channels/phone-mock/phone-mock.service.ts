import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt, randomUUID } from 'crypto';
import { MessagesService } from '../../messages/messages.service';
import { PrismaService } from '../../prisma/prisma.service';
import { canAccessProtocol } from '../../protocols/protocol-access';

/** Relatos fictícios usados quando o atendente não informa um resumo. */
const FAKE_CALL_SUMMARIES = [
  'Cliente ligou para a central informando que o problema continua mesmo após reiniciar o modem.',
  'Cliente confirmou por telefone o endereço e a janela de horário para a visita técnica.',
  'Cliente ligou perguntando o prazo de resolução do chamado.',
  'Cliente relatou na URA que a conexão cai principalmente à noite.',
  'Cliente pediu por telefone a segunda via da fatura com o valor corrigido.',
];

const FAKE_URA_OPTIONS = ['1 - Suporte técnico', '2 - Financeiro', '3 - Planos e serviços'];

/**
 * ⚠️ MOCK: gera uma "ligação recebida" com dados INVENTADOS (número fictício,
 * duração e opção de URA aleatórias). Nenhum dado real de telefonia é usado.
 * A mensagem entra na timeline pelo mesmo caminho de qualquer canal externo
 * (MessagesService.createInbound), provando que o histórico é unificado.
 */
@Injectable()
export class PhoneMockService {
  constructor(
    private readonly messages: MessagesService,
    private readonly prisma: PrismaService,
  ) {}

  async simulateIncomingCall(actor: { id: string; role: string }, protocolId: string, summary?: string) {
    const protocol = await this.prisma.protocol.findUnique({ where: { id: protocolId } });
    if (!protocol) throw new NotFoundException('Protocolo não encontrado');
    if (!canAccessProtocol(actor, protocol)) throw new ForbiddenException('Acesso negado a este protocolo');

    const callId = `MOCK-CALL-${randomUUID().slice(0, 8).toUpperCase()}`;
    const durationSec = randomInt(45, 900);
    const uraOption = FAKE_URA_OPTIONS[randomInt(FAKE_URA_OPTIONS.length)];
    // Número fictício (faixa 0000-0999 não é atribuída a clientes reais nesta PoC)
    const callerNumber = `(11) 90000-0${randomInt(100, 1000)}`;
    const text = summary?.trim() || FAKE_CALL_SUMMARIES[randomInt(FAKE_CALL_SUMMARIES.length)];
    const minutes = Math.floor(durationSec / 60);
    const seconds = String(durationSec % 60).padStart(2, '0');

    return this.messages.createInbound({
      protocolId,
      channel: 'PHONE',
      externalId: callId,
      content: `📞 [Ligação simulada · ${minutes}m${seconds}s · URA ${uraOption}] ${text}`,
      metadata: { mock: true, callId, durationSec, uraOption, callerNumber },
    });
  }
}
