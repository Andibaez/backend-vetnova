import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServicioDto } from './dto/create-servicio.dto';
import { UpdateServicioDto } from './dto/update-servicio.dto';

@Injectable()
export class ServiciosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(clinicaId?: number | null) {
    return this.prisma.servicios.findMany({
      where: clinicaId ? { id_clinica: clinicaId } : undefined,
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number) {
    const servicio = await this.prisma.servicios.findUnique({ where: { id_servicio: id } });
    if (!servicio) throw new NotFoundException('Servicio no encontrado.');
    return servicio;
  }

  create(dto: CreateServicioDto) {
    return this.prisma.servicios.create({ data: dto });
  }

  async update(id: number, dto: UpdateServicioDto) {
    await this.findOne(id);
    return this.prisma.servicios.update({ where: { id_servicio: id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.detalle_servicios.deleteMany({ where: { id_servicio: id } }),
      this.prisma.servicios.delete({ where: { id_servicio: id } }),
    ]);
    return { message: 'Servicio eliminado.' };
  }
}
