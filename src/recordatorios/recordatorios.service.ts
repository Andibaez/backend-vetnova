import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecordatorioDto } from './dto/create-recordatorio.dto';
import { UpdateRecordatorioDto } from './dto/update-recordatorio.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import { PaginationDto, paginate, paginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class RecordatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, id_mascota?: number, pagination: PaginationDto = {}) {
    const clinicaId = this.requireClinicaId(user);
    const { take, skip } = paginate(pagination.page, pagination.limit);
    const mascotaFilter = {
      id_clinica: clinicaId,
      ...(id_mascota ? { id_mascota } : {}),
    };

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop) return paginatedResponse([], 0, pagination.page ?? 1, pagination.limit ?? 20);
      const where = { mascotas: { ...mascotaFilter, id_propietario: prop.id_propietario } };
      const [recordatorios, total] = await Promise.all([
        this.prisma.recordatorios.findMany({
          where,
          include: { mascotas: { select: { nombre: true } } },
          orderBy: { fecha_recordatorio: 'asc' },
          take,
          skip,
        }),
        this.prisma.recordatorios.count({ where }),
      ]);
      return paginatedResponse(recordatorios, total, pagination.page ?? 1, pagination.limit ?? 20);
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet) return paginatedResponse([], 0, pagination.page ?? 1, pagination.limit ?? 20);
      const where = {
        mascotas: {
          ...mascotaFilter,
          citas: { some: { id_veterinario: vet.id_veterinario, id_clinica: clinicaId } },
        },
      };
      const [recordatorios, total] = await Promise.all([
        this.prisma.recordatorios.findMany({
          where,
          include: { mascotas: { select: { nombre: true } } },
          orderBy: { fecha_recordatorio: 'asc' },
          take,
          skip,
        }),
        this.prisma.recordatorios.count({ where }),
      ]);
      return paginatedResponse(recordatorios, total, pagination.page ?? 1, pagination.limit ?? 20);
    }

    const where = { mascotas: mascotaFilter };
    const [recordatorios, total] = await Promise.all([
      this.prisma.recordatorios.findMany({
        where,
        include: { mascotas: { select: { nombre: true } } },
        orderBy: { fecha_recordatorio: 'asc' },
        take,
        skip,
      }),
      this.prisma.recordatorios.count({ where }),
    ]);
    return paginatedResponse(recordatorios, total, pagination.page ?? 1, pagination.limit ?? 20);
  }

  async findOne(id: number, user: JwtPayload) {
    const rec = await this.prisma.recordatorios.findUnique({
      where: { id_recordatorio: id },
      include: { mascotas: true },
    });
    if (!rec) throw new NotFoundException('Recordatorio no encontrado.');

    if (!rec.mascotas) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(rec.mascotas, user);
    return rec;
  }

  async create(dto: CreateRecordatorioDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota: dto.id_mascota } });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    return this.prisma.recordatorios.create({
      data: {
        mensaje: dto.mensaje,
        fecha_recordatorio: new Date(dto.fecha_recordatorio),
        estado: dto.estado ?? 'pendiente',
        id_mascota: dto.id_mascota,
      },
      include: { mascotas: { select: { nombre: true } } },
    });
  }

  async update(id: number, dto: UpdateRecordatorioDto, user: JwtPayload) {
    const rec = await this.prisma.recordatorios.findUnique({
      where: { id_recordatorio: id },
      include: { mascotas: true },
    });
    if (!rec) throw new NotFoundException('Recordatorio no encontrado.');
    if (!rec.mascotas) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(rec.mascotas, user);

    if (dto.id_mascota && dto.id_mascota !== rec.id_mascota) {
      const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota: dto.id_mascota } });
      if (!mascota) throw new NotFoundException('Mascota no encontrada.');
      await this.assertMascotaAccess(mascota, user);
    }

    return this.prisma.recordatorios.update({
      where: { id_recordatorio: id },
      data: {
        ...(dto.mensaje && { mensaje: dto.mensaje }),
        ...(dto.fecha_recordatorio && { fecha_recordatorio: new Date(dto.fecha_recordatorio) }),
        ...(dto.estado && { estado: dto.estado }),
        ...(dto.id_mascota && { id_mascota: dto.id_mascota }),
      },
      include: { mascotas: { select: { nombre: true } } },
    });
  }

  async remove(id: number, user: JwtPayload) {
    const rec = await this.prisma.recordatorios.findUnique({
      where: { id_recordatorio: id },
      include: { mascotas: true },
    });
    if (!rec) throw new NotFoundException('Recordatorio no encontrado.');
    if (!rec.mascotas) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(rec.mascotas, user);

    await this.prisma.recordatorios.delete({ where: { id_recordatorio: id } });
    return { message: 'Recordatorio eliminado.' };
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }

  private async assertMascotaAccess(
    mascota: { id_mascota: number; id_propietario: number | null; id_clinica: number | null },
    user: JwtPayload,
  ) {
    const clinicaId = this.requireClinicaId(user);
    if (mascota.id_clinica !== clinicaId) {
      throw new ForbiddenException('No tienes permiso para acceder a este recordatorio.');
    }

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop || prop.id_clinica !== clinicaId || mascota.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('No tienes permiso para acceder a este recordatorio.');
      }
      return;
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet) throw new ForbiddenException('No tienes un perfil de veterinario.');

      const asignada = await this.prisma.citas.findFirst({
        where: {
          id_mascota: mascota.id_mascota,
          id_veterinario: vet.id_veterinario,
          id_clinica: clinicaId,
        },
        select: { id_cita: true },
      });
      if (!asignada) {
        throw new ForbiddenException('Solo puedes acceder a pacientes asignados a ti.');
      }
    }
  }
}
