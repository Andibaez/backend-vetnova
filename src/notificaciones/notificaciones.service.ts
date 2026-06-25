import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import { NotificationsGateway } from './notifications.gateway';
import { ContactoPublicoDto } from './dto/contacto-publico.dto';

@Injectable()
export class NotificacionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async findAll(user: JwtPayload, soloNoLeidas?: boolean) {
    const clinicaId = this.requireClinicaId(user);
    const notificaciones = await this.prisma.notificaciones.findMany({
      where: {
        id_usuario_destino: user.sub,
        ...(clinicaId !== null ? { destino: { id_clinica: clinicaId } } : {}),
        ...(soloNoLeidas ? { leida: false } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: {
        origen: { select: { nombre: true, email: true } },
      },
    });
    return notificaciones.map((n) => this.toDto(n));
  }

  private toDto(n: {
    id_notificacion: number;
    titulo: string;
    mensaje: string;
    leida: boolean;
    tipo: string;
    created_at: Date;
  }) {
    return {
      id: n.id_notificacion,
      titulo: n.titulo,
      mensaje: n.mensaje,
      leida: n.leida,
      tipo: n.tipo,
      creadaEn: n.created_at.toISOString(),
    };
  }

  async count(user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    const total = await this.prisma.notificaciones.count({
      where: {
        id_usuario_destino: user.sub,
        leida: false,
        ...(clinicaId !== null ? { destino: { id_clinica: clinicaId } } : {}),
      },
    });
    return { count: total };
  }

  async marcarLeida(id: number, user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    return this.prisma.notificaciones.updateMany({
      where: {
        id_notificacion: id,
        id_usuario_destino: user.sub,
        ...(clinicaId !== null ? { destino: { id_clinica: clinicaId } } : {}),
      },
      data: { leida: true },
    });
  }

  async marcarTodasLeidas(user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    await this.prisma.notificaciones.updateMany({
      where: {
        id_usuario_destino: user.sub,
        leida: false,
        ...(clinicaId !== null ? { destino: { id_clinica: clinicaId } } : {}),
      },
      data: { leida: true },
    });
    return { message: 'Todas las notificaciones marcadas como leídas.' };
  }

  async remove(id: number, user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    const notificacion = await this.prisma.notificaciones.findUnique({
      where: { id_notificacion: id },
      include: {
        destino: { select: { id_usuario: true, id_clinica: true } },
      },
    });

    if (!notificacion) {
      throw new NotFoundException('Notificación no encontrada.');
    }

    const mismaClinica =
      clinicaId === null || notificacion.destino.id_clinica === clinicaId;

    if (notificacion.id_usuario_destino !== user.sub || !mismaClinica) {
      throw new ForbiddenException(
        'No tienes permiso para eliminar esta notificación.',
      );
    }

    await this.prisma.notificaciones.delete({ where: { id_notificacion: id } });
    return { message: 'Notificación eliminada.' };
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
    await this.assertSameClinic(id_usuario_destino, id_usuario_origen);

    const notificacion = await this.prisma.notificaciones.create({
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

    this.notificationsGateway.emitToUser(
      id_usuario_destino,
      this.toDto(notificacion),
    );
  }

  async crearParaAdmins(
    titulo: string,
    mensaje: string,
    tipo: string,
    clinicaId: number,
    id_usuario_origen?: number,
    referencia_id?: number,
    referencia_tipo?: string,
  ) {
    const admins = await this.prisma.usuarios.findMany({
      where: { roles: { nombre: ROLES.ADMIN }, id_clinica: clinicaId },
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

    const createdAt = new Date();
    for (const admin of admins) {
      this.notificationsGateway.emitToUser(admin.id_usuario, {
        titulo,
        mensaje,
        tipo,
        leida: false,
        creadaEn: createdAt.toISOString(),
      });
    }
  }

  // El SuperAdministrador no pertenece a ninguna clínica: sus notificaciones
  // no se filtran por id_clinica (devolver null desactiva ese filtro).
  private requireClinicaId(user?: JwtPayload): number | null {
    if (user?.role === ROLES.SUPER_ADMIN) return null;
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }

  async crearParaSuperAdmin(
    titulo: string,
    mensaje: string,
    tipo: string,
    referencia_id?: number,
    referencia_tipo?: string,
  ) {
    const superAdmin = await this.prisma.usuarios.findFirst({
      where: { roles: { nombre: ROLES.SUPER_ADMIN } },
      select: { id_usuario: true },
    });

    if (!superAdmin) return;

    const notificacion = await this.prisma.notificaciones.create({
      data: {
        titulo,
        mensaje,
        tipo,
        id_usuario_destino: superAdmin.id_usuario,
        referencia_id: referencia_id ?? null,
        referencia_tipo: referencia_tipo ?? null,
      },
    });

    this.notificationsGateway.emitToUser(
      superAdmin.id_usuario,
      this.toDto(notificacion),
    );
  }

  async crearDesdeContactoPublico(dto: ContactoPublicoDto) {
    const titulo = `Nuevo mensaje de contacto: ${dto.asunto}`;
    const mensaje = `${dto.nombre} (${dto.email}) escribió:\n\n${dto.mensaje}`;
    await this.crearParaSuperAdmin(titulo, mensaje, 'contacto_publico');
    return { message: 'Mensaje recibido.' };
  }

  private async assertSameClinic(
    id_usuario_destino: number,
    id_usuario_origen?: number,
  ) {
    const destino = await this.prisma.usuarios.findUnique({
      where: { id_usuario: id_usuario_destino },
      select: { id_clinica: true },
    });
    if (!destino) throw new NotFoundException('Usuario destino no encontrado.');
    if (!destino.id_clinica) {
      throw new ForbiddenException(
        'El usuario destino no tiene una clínica asociada.',
      );
    }

    if (!id_usuario_origen) return;

    const origen = await this.prisma.usuarios.findUnique({
      where: { id_usuario: id_usuario_origen },
      select: { id_clinica: true },
    });
    if (!origen) throw new NotFoundException('Usuario origen no encontrado.');
    if (origen.id_clinica !== destino.id_clinica) {
      throw new ForbiddenException(
        'Origen y destino no pertenecen a la misma clínica.',
      );
    }
  }
}
