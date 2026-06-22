import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { MailService } from '../mail/mail.service';
import { CreateCitaDto } from './dto/create-cita.dto';
import { UpdateCitaDto } from './dto/update-cita.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import { tenantWhere } from '../common/utils/tenant.util';
import {
  PaginationDto,
  paginate,
  paginatedResponse,
} from '../common/dto/pagination.dto';

const CITA_INCLUDE = {
  mascotas: {
    include: { propietario: true },
  },
  usuarios: { select: { id_usuario: true, nombre: true, email: true } },
  veterinarios: {
    select: {
      id_veterinario: true,
      especialidad: true,
      usuarios: { select: { id_usuario: true, nombre: true } },
    },
  },
} as const;

type CitaConRelaciones = {
  veterinarios?: {
    usuarios: { id_usuario: number; nombre: string | null };
  } | null;
  [key: string]: unknown;
};

function flattenVeterinario<T extends CitaConRelaciones>(cita: T) {
  return {
    ...cita,
    veterinario: cita.veterinarios?.usuarios?.nombre ?? null,
    id_usuario_veterinario: cita.veterinarios?.usuarios?.id_usuario ?? null,
  };
}

@Injectable()
export class CitasService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
    private mail: MailService,
  ) {}

  async create(dto: CreateCitaDto, user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });
    if (!mascota) throw new BadRequestException('La mascota no existe');
    if (mascota.id_clinica !== clinicaId) {
      throw new ForbiddenException('La mascota no pertenece a tu clínica.');
    }

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (
        !prop ||
        prop.id_clinica !== clinicaId ||
        mascota.id_propietario !== prop.id_propietario
      ) {
        throw new ForbiddenException(
          'Solo puedes agendar citas para tus mascotas.',
        );
      }
    }

    const id_usuario =
      user.role === ROLES.CLIENTE ? user.sub : (dto.id_usuario ?? user.sub);
    const usuarioCita = await this.prisma.usuarios.findUnique({
      where: { id_usuario },
      select: { id_clinica: true },
    });
    if (!usuarioCita || usuarioCita.id_clinica !== clinicaId) {
      throw new ForbiddenException(
        'El usuario de la cita no pertenece a tu clínica.',
      );
    }

    // Resolver id_veterinario: ID directo > id_usuario del vet > nombre como fallback
    let id_veterinario = dto.id_veterinario ?? null;
    if (!id_veterinario && dto.id_usuario_veterinario) {
      const vet = await this.prisma.veterinarios.upsert({
        where: { id_usuario: dto.id_usuario_veterinario },
        create: { id_usuario: dto.id_usuario_veterinario },
        update: {},
      });
      id_veterinario = vet.id_veterinario;
    }
    if (!id_veterinario && dto.veterinario) {
      const vet = await this.prisma.veterinarios.findFirst({
        where: {
          usuarios: {
            nombre: { contains: dto.veterinario, mode: 'insensitive' },
            id_clinica: clinicaId,
          },
        },
      });
      if (vet) id_veterinario = vet.id_veterinario;
    }
    if (id_veterinario) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_veterinario },
        include: { usuarios: { select: { id_clinica: true } } },
      });
      if (!vet) throw new BadRequestException('El veterinario no existe');
      if (vet.usuarios.id_clinica !== clinicaId) {
        throw new ForbiddenException(
          'El veterinario no pertenece a tu clínica.',
        );
      }
    }

    const cita = await this.prisma.citas.create({
      data: {
        fecha: new Date(dto.fecha),
        hora: dto.hora,
        estado: dto.estado ?? 'pendiente',
        servicio: dto.servicio,
        notas: dto.notas,
        id_mascota: dto.id_mascota,
        id_usuario,
        id_veterinario,
        id_clinica: clinicaId,
      },
      include: CITA_INCLUDE,
    });

    const mascotaNombre = cita.mascotas?.nombre ?? 'su mascota';

    if (user.role === ROLES.CLIENTE) {
      await this.notificaciones.crearParaAdmins(
        'Nueva cita solicitada',
        `${user.name} ha solicitado una cita para ${mascotaNombre} el ${dto.fecha} a las ${dto.hora}.`,
        'nueva_cita',
        clinicaId,
        user.sub,
        cita.id_cita,
        'cita',
      );
    }

    // Notificar al veterinario asignado
    if (id_veterinario) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_veterinario },
        select: { id_usuario: true },
      });
      if (vet) {
        await this.notificaciones.crearParaUsuario(
          vet.id_usuario,
          'Nueva cita asignada',
          `Tienes una nueva cita para ${mascotaNombre} el ${dto.fecha} a las ${dto.hora}.`,
          'nueva_cita',
          user.sub,
          cita.id_cita,
          'cita',
        );
      }
    }

    if (cita.usuarios?.email) {
      await this.mail.sendAppointmentConfirmation(cita.usuarios.email, {
        nombre: cita.usuarios.nombre ?? 'cliente',
        mascota: mascotaNombre,
        fecha: this.formatFecha(cita.fecha),
        hora: cita.hora ?? dto.hora,
        servicio: cita.servicio,
        veterinario: cita.veterinarios?.usuarios?.nombre ?? null,
      });
    }

    return flattenVeterinario(cita);
  }

  async findAll(
    user: JwtPayload,
    pagination: PaginationDto = {},
    id_usuario?: number,
  ) {
    const { take, skip } = paginate(pagination.page, pagination.limit);
    const order = [{ fecha: 'desc' as const }, { hora: 'desc' as const }];

    if (user.role === ROLES.CLIENTE) {
      const where = { id_usuario: user.sub, ...tenantWhere(user) };
      const [citas, total] = await Promise.all([
        this.prisma.citas.findMany({
          where,
          include: CITA_INCLUDE,
          orderBy: order,
          take,
          skip,
        }),
        this.prisma.citas.count({ where }),
      ]);
      return paginatedResponse(
        citas.map(flattenVeterinario),
        total,
        pagination.page ?? 1,
        pagination.limit ?? 20,
      );
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!vet) return paginatedResponse([], 0, 1, pagination.limit ?? 20);
      const where = {
        id_veterinario: vet.id_veterinario,
        ...tenantWhere(user),
      };
      const [citas, total] = await Promise.all([
        this.prisma.citas.findMany({
          where,
          include: CITA_INCLUDE,
          orderBy: order,
          take,
          skip,
        }),
        this.prisma.citas.count({ where }),
      ]);
      return paginatedResponse(
        citas.map(flattenVeterinario),
        total,
        pagination.page ?? 1,
        pagination.limit ?? 20,
      );
    }

    const where = {
      ...tenantWhere(user),
      ...(id_usuario ? { id_usuario } : {}),
    };
    const [citas, total] = await Promise.all([
      this.prisma.citas.findMany({
        where,
        include: CITA_INCLUDE,
        orderBy: order,
        take,
        skip,
      }),
      this.prisma.citas.count({ where }),
    ]);
    return paginatedResponse(
      citas.map(flattenVeterinario),
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  async findOne(id: number, user: JwtPayload) {
    const cita = await this.prisma.citas.findUnique({
      where: { id_cita: id },
      include: CITA_INCLUDE,
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');
    if (user.role !== ROLES.SUPER_ADMIN && cita.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Cita no encontrada');
    }

    if (user.role === ROLES.CLIENTE && cita.id_usuario !== user.sub) {
      throw new ForbiddenException('No tienes permiso para ver esta cita.');
    }
    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!vet || cita.id_veterinario !== vet.id_veterinario) {
        throw new ForbiddenException('Esta cita no está asignada a ti.');
      }
    }
    return flattenVeterinario(cita);
  }

  async update(id: number, dto: UpdateCitaDto, user: JwtPayload) {
    const existing = await this.prisma.citas.findUnique({
      where: { id_cita: id },
      include: {
        mascotas: true,
        usuarios: { select: { id_usuario: true, nombre: true, email: true } },
      },
    });
    if (!existing) throw new NotFoundException('Cita no existe');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      existing.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Cita no existe');
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!vet || existing.id_veterinario !== vet.id_veterinario) {
        throw new ForbiddenException(
          'Solo puedes actualizar citas asignadas a ti.',
        );
      }
    }

    // Veterinario solo puede modificar campos clínicos — nunca reasignar mascota, usuario o veterinario
    const data: Record<string, unknown> =
      user.role === ROLES.VETERINARIO
        ? { estado: dto.estado, notas: dto.notas, servicio: dto.servicio }
        : (() => {
            const { veterinario, id_usuario_veterinario, ...rest } = dto;
            const d: Record<string, unknown> = { ...rest };

            // Resolver id_veterinario: preferir id_usuario_veterinario, luego nombre
            if (rest.id_veterinario === undefined) {
              if (id_usuario_veterinario) {
                d._resolveVetByUsuario = id_usuario_veterinario;
              } else if (veterinario) {
                d._resolveVet = veterinario;
              }
            }
            return d;
          })();

    // Resolver vet por id_usuario (más confiable)
    if (data._resolveVetByUsuario) {
      const vet = await this.prisma.veterinarios.upsert({
        where: { id_usuario: data._resolveVetByUsuario as number },
        create: { id_usuario: data._resolveVetByUsuario as number },
        update: {},
      });
      data.id_veterinario = vet.id_veterinario;
      delete data._resolveVetByUsuario;
    }

    // Resolver vet por nombre como fallback
    if (data._resolveVet) {
      const clinicaId = this.requireClinicaId(user);
      const vet = await this.prisma.veterinarios.findFirst({
        where: {
          usuarios: {
            nombre: {
              contains: data._resolveVet as string,
              mode: 'insensitive',
            },
            id_clinica: clinicaId,
          },
        },
      });
      data.id_veterinario = vet?.id_veterinario ?? undefined;
      delete data._resolveVet;
    }

    if (data.id_veterinario !== undefined) {
      const clinicaId = this.requireClinicaId(user);
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_veterinario: data.id_veterinario as number },
        include: { usuarios: { select: { id_clinica: true } } },
      });
      if (!vet) throw new BadRequestException('El veterinario no existe');
      if (vet.usuarios.id_clinica !== clinicaId) {
        throw new ForbiddenException(
          'El veterinario no pertenece a tu clínica.',
        );
      }
    }

    if (data.fecha) data.fecha = new Date(data.fecha as string);

    const cita = await this.prisma.citas.update({
      where: { id_cita: id },
      data,
      include: CITA_INCLUDE,
    });

    await this.notificarActualizacionCita(existing, cita, user);

    return flattenVeterinario(cita);
  }

  private async notificarActualizacionCita(
    existing: {
      id_usuario: number | null;
      estado: string | null;
      fecha: Date | null;
      hora: string | null;
      mascotas: { nombre: string | null } | null;
      usuarios?: {
        id_usuario: number;
        nombre: string | null;
        email: string;
      } | null;
    },
    cita: {
      id_cita: number;
      estado: string | null;
      fecha: Date | null;
      hora: string | null;
    },
    user: JwtPayload,
  ) {
    if (!existing.id_usuario || !cita.estado || !cita.fecha || !cita.hora)
      return;

    const estadoCambio = cita.estado !== existing.estado;
    const fechaHoraCambio =
      cita.fecha.getTime() !== existing.fecha?.getTime() ||
      cita.hora !== existing.hora;

    if (!estadoCambio && !fechaHoraCambio) return;

    const mascotaNombre = existing.mascotas?.nombre ?? 'tu mascota';
    const fechaTexto = cita.fecha.toISOString().slice(0, 10);
    const horaTexto = cita.hora;

    const mensajesEstado: Record<string, string> = {
      confirmada: `Tu cita para ${mascotaNombre} fue confirmada para el ${fechaTexto} a las ${horaTexto}.`,
      cancelada: `Tu cita para ${mascotaNombre} del ${fechaTexto} fue cancelada.`,
      reprogramada: `Tu cita para ${mascotaNombre} fue reprogramada para el ${fechaTexto} a las ${horaTexto}.`,
      finalizada: `La consulta de ${mascotaNombre} fue finalizada.`,
      'en espera': `${mascotaNombre} se encuentra en sala de espera para su cita.`,
      'en atención': `${mascotaNombre} está siendo atendido/a en este momento.`,
      'no asistió': `${mascotaNombre} no asistió a la cita programada del ${fechaTexto}.`,
      pendiente: `Tu cita para ${mascotaNombre} está pendiente de confirmación.`,
    };

    let titulo = 'Actualización de tu cita';
    let mensaje: string;

    if (estadoCambio) {
      mensaje =
        mensajesEstado[cita.estado] ??
        `El estado de tu cita para ${mascotaNombre} cambió a "${cita.estado}".`;
      if (fechaHoraCambio && cita.estado !== 'reprogramada') {
        mensaje += ` Nueva fecha: ${fechaTexto} a las ${horaTexto}.`;
      }
    } else {
      titulo = 'Tu cita fue reprogramada';
      mensaje = `Tu cita para ${mascotaNombre} fue reprogramada para el ${fechaTexto} a las ${horaTexto}.`;
    }

    await this.notificaciones.crearParaUsuario(
      existing.id_usuario,
      titulo,
      mensaje,
      'cita_actualizada',
      user.sub,
      cita.id_cita,
      'cita',
    );

    if (estadoCambio && cita.estado === 'cancelada' && existing.usuarios?.email) {
      await this.mail.sendAppointmentCancelled(existing.usuarios.email, {
        nombre: existing.usuarios.nombre ?? 'cliente',
        mascota: mascotaNombre,
        fecha: fechaTexto,
        hora: horaTexto,
      });
    }
  }

  async remove(id: number, user: JwtPayload) {
    const cita = await this.prisma.citas.findUnique({
      where: { id_cita: id },
      include: {
        mascotas: true,
        usuarios: { select: { nombre: true, email: true } },
      },
    });
    if (!cita) throw new NotFoundException('Cita no existe');
    if (user.role !== ROLES.SUPER_ADMIN && cita.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Cita no existe');
    }
    const deleted = await this.prisma.citas.delete({ where: { id_cita: id } });

    if (cita.usuarios?.email && cita.fecha && cita.hora) {
      await this.mail.sendAppointmentCancelled(cita.usuarios.email, {
        nombre: cita.usuarios.nombre ?? 'cliente',
        mascota: cita.mascotas?.nombre ?? 'tu mascota',
        fecha: this.formatFecha(cita.fecha),
        hora: cita.hora,
      });
    }

    return deleted;
  }

  private formatFecha(fecha: Date | string | null | undefined): string {
    if (!fecha) return '';
    const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
    return date.toISOString().slice(0, 10);
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }
}
