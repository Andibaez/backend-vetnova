import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CreateCitaDto } from './dto/create-cita.dto';
import { UpdateCitaDto } from './dto/update-cita.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import { PaginationDto, paginate, paginatedResponse } from '../common/dto/pagination.dto';

const CITA_INCLUDE = {
  mascotas: {
    include: { propietario: true },
  },
  usuarios: { select: { id_usuario: true, nombre: true } },
  veterinarios: { select: { id_veterinario: true, especialidad: true, usuarios: { select: { nombre: true } } } },
} as const;

type CitaConRelaciones = {
  veterinarios?: { usuarios: { nombre: string | null } } | null;
  [key: string]: unknown;
};

function flattenVeterinario<T extends CitaConRelaciones>(cita: T) {
  return {
    ...cita,
    veterinario: cita.veterinarios?.usuarios?.nombre ?? null,
  };
}

@Injectable()
export class CitasService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  async create(dto: CreateCitaDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });
    if (!mascota) throw new BadRequestException('La mascota no existe');

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop || mascota.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('Solo puedes agendar citas para tus mascotas.');
      }
    }

    const id_usuario = user.role === ROLES.CLIENTE ? user.sub : (dto.id_usuario ?? user.sub);

    // Resolver id_veterinario: usar el ID directo o buscar por nombre como fallback
    let id_veterinario = dto.id_veterinario ?? null;
    if (!id_veterinario && dto.veterinario) {
      const vet = await this.prisma.veterinarios.findFirst({
        where: { usuarios: { nombre: { contains: dto.veterinario, mode: 'insensitive' } } },
      });
      if (vet) id_veterinario = vet.id_veterinario;
    }
    if (id_veterinario) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_veterinario },
      });
      if (!vet) throw new BadRequestException('El veterinario no existe');
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
      },
      include: CITA_INCLUDE,
    });

    if (user.role === ROLES.CLIENTE) {
      const mascotaNombre = (cita as any).mascotas?.nombre ?? 'su mascota';
      await this.notificaciones.crearParaAdmins(
        'Nueva cita solicitada',
        `${user.name} ha solicitado una cita para ${mascotaNombre} el ${dto.fecha} a las ${dto.hora}.`,
        'nueva_cita',
        user.sub,
        cita.id_cita,
        'cita',
      );
    }

    return flattenVeterinario(cita);
  }

  async findAll(user: JwtPayload, pagination: PaginationDto = {}) {
    const { take, skip } = paginate(pagination.page, pagination.limit);
    const order = [{ fecha: 'asc' as const }, { hora: 'asc' as const }];

    if (user.role === ROLES.CLIENTE) {
      const where = { id_usuario: user.sub };
      const [citas, total] = await Promise.all([
        this.prisma.citas.findMany({ where, include: CITA_INCLUDE, orderBy: order, take, skip }),
        this.prisma.citas.count({ where }),
      ]);
      return paginatedResponse(citas.map(flattenVeterinario), total, pagination.page ?? 1, pagination.limit ?? 20);
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet) return paginatedResponse([], 0, 1, pagination.limit ?? 20);
      const where = { id_veterinario: vet.id_veterinario };
      const [citas, total] = await Promise.all([
        this.prisma.citas.findMany({ where, include: CITA_INCLUDE, orderBy: order, take, skip }),
        this.prisma.citas.count({ where }),
      ]);
      return paginatedResponse(citas.map(flattenVeterinario), total, pagination.page ?? 1, pagination.limit ?? 20);
    }

    const [citas, total] = await Promise.all([
      this.prisma.citas.findMany({ include: CITA_INCLUDE, orderBy: order, take, skip }),
      this.prisma.citas.count(),
    ]);
    return paginatedResponse(citas.map(flattenVeterinario), total, pagination.page ?? 1, pagination.limit ?? 20);
  }

  async findOne(id: number, user: JwtPayload) {
    const cita = await this.prisma.citas.findUnique({
      where: { id_cita: id },
      include: CITA_INCLUDE,
    });
    if (!cita) throw new NotFoundException('Cita no encontrada');

    if (user.role === ROLES.CLIENTE && cita.id_usuario !== user.sub) {
      throw new ForbiddenException('No tienes permiso para ver esta cita.');
    }
    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet || cita.id_veterinario !== vet.id_veterinario) {
        throw new ForbiddenException('Esta cita no está asignada a ti.');
      }
    }
    return flattenVeterinario(cita);
  }

  async update(id: number, dto: UpdateCitaDto, user: JwtPayload) {
    const existing = await this.prisma.citas.findUnique({ where: { id_cita: id } });
    if (!existing) throw new NotFoundException('Cita no existe');

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet || existing.id_veterinario !== vet.id_veterinario) {
        throw new ForbiddenException('Solo puedes actualizar citas asignadas a ti.');
      }
    }

    // Veterinario solo puede modificar campos clínicos — nunca reasignar mascota, usuario o veterinario
    const data: Record<string, unknown> =
      user.role === ROLES.VETERINARIO
        ? { estado: dto.estado, notas: dto.notas, servicio: dto.servicio }
        : (() => {
            const { veterinario, ...rest } = dto;
            const d: Record<string, unknown> = { ...rest };

            // Resolver id_veterinario por nombre si no viene el ID
            if (rest.id_veterinario === undefined && veterinario) {
              // Resolución asíncrona manejada abajo
              d._resolveVet = veterinario;
            }
            return d;
          })();

    // Resolver nombre de veterinario para Admin
    if (data._resolveVet) {
      const vet = await this.prisma.veterinarios.findFirst({
        where: { usuarios: { nombre: { contains: data._resolveVet as string, mode: 'insensitive' } } },
      });
      data.id_veterinario = vet?.id_veterinario ?? undefined;
      delete data._resolveVet;
    }

    if (data.id_veterinario !== undefined) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_veterinario: data.id_veterinario as number } });
      if (!vet) throw new BadRequestException('El veterinario no existe');
    }

    if (data.fecha) data.fecha = new Date(data.fecha as string);

    const cita = await this.prisma.citas.update({
      where: { id_cita: id },
      data,
      include: CITA_INCLUDE,
    });
    return flattenVeterinario(cita);
  }

  async remove(id: number) {
    const cita = await this.prisma.citas.findUnique({ where: { id_cita: id } });
    if (!cita) throw new NotFoundException('Cita no existe');
    return this.prisma.citas.delete({ where: { id_cita: id } });
  }
}
