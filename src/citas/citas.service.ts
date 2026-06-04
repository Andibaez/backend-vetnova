import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCitaDto } from './dto/create-cita.dto';
import { UpdateCitaDto } from './dto/update-cita.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

const CITA_INCLUDE = {
  mascotas: {
    include: { propietario: true },
  },
  usuarios: { select: { id_usuario: true, nombre: true } },
  veterinarios: { select: { id_veterinario: true, especialidad: true, usuarios: { select: { nombre: true } } } },
} as const;

@Injectable()
export class CitasService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCitaDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });
    if (!mascota) throw new BadRequestException('La mascota no existe');

    // El cliente solo puede crear citas para sus propias mascotas
    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop || mascota.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('Solo puedes agendar citas para tus mascotas.');
      }
    }

    const id_usuario = user.role === ROLES.CLIENTE ? user.sub : (dto.id_usuario ?? user.sub);

    if (dto.id_veterinario) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_veterinario: dto.id_veterinario },
      });
      if (!vet) throw new BadRequestException('El veterinario no existe');
    }

    return this.prisma.citas.create({
      data: {
        fecha: new Date(dto.fecha),
        hora: dto.hora,
        estado: dto.estado ?? 'pendiente',
        servicio: dto.servicio,
        notas: dto.notas,
        id_mascota: dto.id_mascota,
        id_usuario,
        id_veterinario: dto.id_veterinario,
      },
      include: CITA_INCLUDE,
    });
  }

  async findAll(user: JwtPayload) {
    if (user.role === ROLES.CLIENTE) {
      return this.prisma.citas.findMany({
        where: { id_usuario: user.sub },
        include: CITA_INCLUDE,
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      });
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!vet) return [];
      return this.prisma.citas.findMany({
        where: { id_veterinario: vet.id_veterinario },
        include: CITA_INCLUDE,
        orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
      });
    }

    return this.prisma.citas.findMany({
      include: CITA_INCLUDE,
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
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
    return cita;
  }

  async update(id: number, dto: UpdateCitaDto, user: JwtPayload) {
    const cita = await this.prisma.citas.findUnique({ where: { id_cita: id } });
    if (!cita) throw new NotFoundException('Cita no existe');

    // El veterinario solo puede actualizar citas asignadas a él
    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet || cita.id_veterinario !== vet.id_veterinario) {
        throw new ForbiddenException('Solo puedes actualizar citas asignadas a ti.');
      }
    }

    return this.prisma.citas.update({
      where: { id_cita: id },
      data: dto,
      include: CITA_INCLUDE,
    });
  }

  async remove(id: number) {
    const cita = await this.prisma.citas.findUnique({ where: { id_cita: id } });
    if (!cita) throw new NotFoundException('Cita no existe');
    return this.prisma.citas.delete({ where: { id_cita: id } });
  }
}
