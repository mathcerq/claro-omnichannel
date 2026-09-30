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

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      this.connectedUsers.set(client.id, {
        userId: payload.sub,
        role: payload.role,
        socketId: client.id,
      });

      client.data.userId = payload.sub;
      client.data.role = payload.role;

      client.join(`user:${payload.sub}`);

      this.logger.log(`Client connected: ${client.id} (user: ${payload.sub}, role: ${payload.role})`);

      client.emit('connected', { message: 'Conectado ao servidor Claro Omnichannel' });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_protocol')
  handleJoinProtocol(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolId: string },
  ) {
    client.join(`protocol:${data.protocolId}`);
    this.logger.log(`Socket ${client.id} joined room: protocol:${data.protocolId}`);
    return { event: 'joined', room: `protocol:${data.protocolId}` };
  }

  @SubscribeMessage('leave_protocol')
  handleLeaveProtocol(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { protocolId: string },
  ) {
    client.leave(`protocol:${data.protocolId}`);
    return { event: 'left', room: `protocol:${data.protocolId}` };
  }

  emitNewMessage(protocolId: string, message: any) {
    this.server.to(`protocol:${protocolId}`).emit('new_message', message);
  }

  emitProtocolUpdated(protocolId: string, protocol: any) {
    this.server.to(`protocol:${protocolId}`).emit('protocol_updated', protocol);
    this.server.emit('protocols_list_updated', { protocolId, ...protocol });
  }

  emitAgentAssigned(protocolId: string, data: any) {
    this.server.to(`protocol:${protocolId}`).emit('agent_assigned', data);
    this.server.emit('protocols_list_updated', { protocolId, ...data });
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }
}
