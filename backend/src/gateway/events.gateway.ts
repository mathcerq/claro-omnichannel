import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { STAFF_ROLES, canAccessProtocol } from '../protocols/protocol-access';
import {
  AssistantTypingEvent,
  ChannelLinkEvent,
  DomainEvents,
  MessageCreatedEvent,
  MessageDeliveryUpdatedEvent,
  ProtocolChangedEvent,
} from '../events/domain-events';

const STAFF_ROOM = 'staff';

/**
 * Tempo real (Socket.io). Salas:
 *  - user:{id}       → notificações do próprio usuário
 *  - staff           → painel dos atendentes (lista de protocolos)
 *  - protocol:{id}   → timeline de um protocolo (somente quem tem acesso)
 *
 * Os eventos de domínio (mensagem criada em QUALQUER canal, protocolo
 * alterado...) são repassados para as salas certas — nunca em broadcast
 * global, para não vazar dados de um cliente para outro (LGPD).
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
  },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');
  private connectedUsers = new Map<string, { userId: string; role: string; socketId: string }>();

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    // Eventos do cliente podem chegar antes do fim da autenticação assíncrona
    client.data.ready = this.authenticate(client);
    await client.data.ready;
  }

  private async authenticate(client: Socket) {
    try {
      const raw =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        '';
      const token = String(raw).replace(/^Bearer\s+/i, '');
      if (!token) return this.reject(client);

      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });

      // Tokens restritos (setup de 2FA / aguardando código) não abrem socket
      if (payload.setupOnly || payload.temp || !payload.role) return this.reject(client);

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, isActive: true },
      });
      if (!user || !user.isActive) return this.reject(client);

      this.connectedUsers.set(client.id, { userId: user.id, role: user.role, socketId: client.id });
      client.data.userId = user.id;
      client.data.role = user.role;

      client.join(`user:${user.id}`);
      if (STAFF_ROLES.includes(user.role)) client.join(STAFF_ROOM);

      this.logger.log(`Socket conectado: ${client.id} (role: ${user.role})`);
      client.emit('connected', { message: 'Conectado ao servidor Claro Omnichannel' });
    } catch {
      this.reject(client);
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
  }

  // Retorno = ack do Socket.io ({ ok, ... }). Não usar a chave `event` no
  // retorno: o Nest a interpreta como "emitir evento" em vez de ack.
  @SubscribeMessage('join_protocol')
  async handleJoinProtocol(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolId: string },
  ) {
    await client.data.ready;
    const protocolId = data?.protocolId;
    if (!client.data.userId || typeof protocolId !== 'string') {
      return { ok: false, error: 'Requisição inválida' };
    }

    // Mesma regra da API REST: cliente só os próprios; atendente só fila/atribuídos
    const protocol = await this.prisma.protocol.findUnique({
      where: { id: protocolId },
      select: { clientId: true, agentId: true },
    });
    if (!protocol || !canAccessProtocol({ id: client.data.userId, role: client.data.role }, protocol)) {
      return { ok: false, error: 'Acesso negado a este protocolo' };
    }

    client.join(`protocol:${protocolId}`);
    return { ok: true, room: `protocol:${protocolId}` };
  }

  @SubscribeMessage('leave_protocol')
  handleLeaveProtocol(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolId: string },
  ) {
    client.leave(`protocol:${data?.protocolId}`);
    return { ok: true };
  }

  // ── Eventos de domínio → WebSocket ──────────────────────────────────────────

  @OnEvent(DomainEvents.MESSAGE_CREATED)
  onMessageCreated(event: MessageCreatedEvent) {
    this.server
      .to(`protocol:${event.protocolId}`)
      .emit('new_message', { ...event.message, protocolId: event.protocolId });
    this.notifyListUpdated(event.protocolId, event.clientId);
  }

  @OnEvent(DomainEvents.MESSAGE_DELIVERY_UPDATED)
  onDeliveryUpdated(event: MessageDeliveryUpdatedEvent) {
    this.server.to(`protocol:${event.protocolId}`).emit('message_updated', {
      id: event.messageId,
      protocolId: event.protocolId,
      deliveryStatus: event.deliveryStatus,
    });
  }

  @OnEvent(DomainEvents.PROTOCOL_CREATED)
  @OnEvent(DomainEvents.PROTOCOL_UPDATED)
  onProtocolChanged(event: ProtocolChangedEvent) {
    this.server.to(`protocol:${event.protocolId}`).emit('protocol_updated', event.protocol);
    this.notifyListUpdated(event.protocolId, event.clientId);
  }

  @OnEvent(DomainEvents.ASSISTANT_TYPING)
  onAssistantTyping(event: AssistantTypingEvent) {
    this.server
      .to(`protocol:${event.protocolId}`)
      .emit('assistant_typing', { protocolId: event.protocolId, typing: event.typing });
  }

  @OnEvent(DomainEvents.CHANNEL_LINKED)
  @OnEvent(DomainEvents.CHANNEL_UNLINKED)
  onChannelLinkChanged(event: ChannelLinkEvent) {
    this.server.to(`user:${event.userId}`).emit('channel_link_updated', { channel: event.channel });
    // Painel: canais disponíveis para responder a este cliente mudaram
    this.server.to(STAFF_ROOM).emit('client_channels_updated', { userId: event.userId, channel: event.channel });
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  private notifyListUpdated(protocolId: string, clientId: string) {
    this.server.to(STAFF_ROOM).to(`user:${clientId}`).emit('protocols_list_updated', { protocolId });
  }

  private reject(client: Socket) {
    client.emit('unauthorized', { message: 'Token inválido ou expirado' });
    client.disconnect(true);
  }
}
