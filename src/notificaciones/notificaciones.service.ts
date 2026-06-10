import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, soloNoLeidas?: boolean) {
    return this.prisma.notificaciones.findMany({
      where: {
        id_usuario_destino: user.sub,
        ...(soloNoLeidas ? { leida: false } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: {
        origen: { select: { nombre: true, email: true } },
      },
    });
  }

  async count(user: JwtPayload) {
    const total = await this.prisma.notificaciones.count({
      where: { id_usuario_destino: user.sub, leida: false },
    });
    return { count: total };
  }

  async marcarLeida(id: number, user: JwtPayload) {
    return this.prisma.notificaciones.updateMany({
      where: { id_notificacion: id, id_usuario_destino: user.sub },
      data: { leida: true },
    });
  }

  async marcarTodasLeidas(user: JwtPayload) {
    await this.prisma.notificaciones.updateMany({
      where: { id_usuario_destino: user.sub, leida: false },
      data: { leida: true },
    });
    return { message: 'Todas las notificaciones marcadas como leídas.' };
  }

  async crearParaUsuario(
    id_usuario_destino: number,
    titulo: string,
    mensaje: string,
    tipo: string,
    id_usuario_origen?: number,
    referencia_id?: number,
    referencia_tipo?: string,
  ) {
    await this.prisma.notificaciones.create({
      data: {
        titulo,
        mensaje,
        tipo,
        id_usuario_destino,
        id_usuario_origen: id_usuario_origen ?? null,
        referencia_id: referencia_id ?? null,
        referencia_tipo: referencia_tipo ?? null,
      },
    });
  }

  async crearParaAdmins(
    titulo: string,
    mensaje: string,
    tipo: string,
    id_usuario_origen?: number,
    referencia_id?: number,
    referencia_tipo?: string,
  ) {
    const admins = await this.prisma.usuarios.findMany({
      where: { roles: { nombre: ROLES.ADMIN } },
      select: { id_usuario: true },
    });

    if (admins.length === 0) return;

    await this.prisma.notificaciones.createMany({
      data: admins.map((admin) => ({
        titulo,
        mensaje,
        tipo,
        id_usuario_destino: admin.id_usuario,
        id_usuario_origen: id_usuario_origen ?? null,
        referencia_id: referencia_id ?? null,
        referencia_tipo: referencia_tipo ?? null,
      })),
    });
  }
}
