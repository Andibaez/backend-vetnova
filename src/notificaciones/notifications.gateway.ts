import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { AUTH_COOKIE_NAME } from '../auth/constants/auth-cookies.constant';

type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: { user?: JwtPayload };
};

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? [
      'http://localhost:3001',
    ],
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: AuthenticatedSocket) {
    const token = this.extractCookie(
      client.handshake.headers.cookie ?? '',
      AUTH_COOKIE_NAME,
    );

    if (!token) {
      this.logger.warn(`Conexión rechazada (sin token): ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwt.verify<JwtPayload & { type?: string }>(token);
      if (payload.type === 'reset') {
        throw new Error('Token de tipo reset no permitido.');
      }
      client.data.user = payload;
      void client.join(this.userRoom(payload.sub));
      this.logger.log(
        `Usuario ${payload.sub} conectado (socket ${client.id}).`,
      );
    } catch {
      this.logger.warn(`Conexión rechazada (token inválido): ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;
    if (user) {
      this.logger.log(
        `Usuario ${user.sub} desconectado (socket ${client.id}).`,
      );
    }
  }

  /**
   * Emite una notificación en tiempo real al usuario indicado.
   * Usado por NotificacionesService tras persistir una notificación.
   */
  emitToUser(userId: number, payload: unknown) {
    this.server.to(this.userRoom(userId)).emit('notification.new', payload);
  }

  private userRoom(userId: number): string {
    return `user:${userId}`;
  }

  private extractCookie(cookieHeader: string, name: string): string | null {
    const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
    for (const cookie of cookies) {
      const [key, ...valueParts] = cookie.split('=');
      if (key === name) {
        return decodeURIComponent(valueParts.join('='));
      }
    }
    return null;
  }
}
