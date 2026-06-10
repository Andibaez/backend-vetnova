import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecordatorioDto } from './dto/create-recordatorio.dto';
import { UpdateRecordatorioDto } from './dto/update-recordatorio.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class RecordatoriosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, id_mascota?: number) {
    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop) return [];
      return this.prisma.recordatorios.findMany({
        where: { mascotas: { id_propietario: prop.id_propietario } },
        include: { mascotas: { select: { nombre: true } } },
        orderBy: { fecha_recordatorio: 'asc' },
      });
    }

    return this.prisma.recordatorios.findMany({
      where: id_mascota ? { id_mascota } : undefined,
      include: { mascotas: { select: { nombre: true } } },
      orderBy: { fecha_recordatorio: 'asc' },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const rec = await this.prisma.recordatorios.findUnique({
      where: { id_recordatorio: id },
      include: { mascotas: { select: { nombre: true, id_propietario: true } } },
    });
    if (!rec) throw new NotFoundException('Recordatorio no encontrado.');

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop || rec.mascotas?.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('No tienes permiso para ver este recordatorio.');
      }
    }
    return rec;
  }

  async create(dto: CreateRecordatorioDto) {
    const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota: dto.id_mascota } });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
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

  async update(id: number, dto: UpdateRecordatorioDto) {
    const rec = await this.prisma.recordatorios.findUnique({ where: { id_recordatorio: id } });
    if (!rec) throw new NotFoundException('Recordatorio no encontrado.');
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

  async remove(id: number) {
    const rec = await this.prisma.recordatorios.findUnique({ where: { id_recordatorio: id } });
    if (!rec) throw new NotFoundException('Recordatorio no encontrado.');
    await this.prisma.recordatorios.delete({ where: { id_recordatorio: id } });
    return { message: 'Recordatorio eliminado.' };
  }
}
