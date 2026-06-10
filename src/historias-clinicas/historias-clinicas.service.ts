import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsultaDto } from './dto/create-consulta.dto';
import { UpdateConsultaDto } from './dto/update-consulta.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class HistoriasClinicasService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMascota(id_mascota: number, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota } });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop || mascota.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('No tienes permiso para ver esta historia clínica.');
      }
    }

    const historia = await this.prisma.historias_clinicas.findUnique({
      where: { id_mascota },
      include: {
        consultas: {
          include: { usuarios: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
        },
      },
    });

    return historia ?? { id_mascota, consultas: [] };
  }

  async createConsulta(dto: CreateConsultaDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota: dto.id_mascota } });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');

    // Obtener o crear la historia clínica de la mascota
    let historia = await this.prisma.historias_clinicas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });
    if (!historia) {
      historia = await this.prisma.historias_clinicas.create({
        data: { id_mascota: dto.id_mascota },
      });
    }

    return this.prisma.consultas.create({
      data: {
        motivo: dto.motivo,
        diagnostico: dto.diagnostico,
        tratamiento: dto.tratamiento,
        id_historia: historia.id_historia,
        id_usuario: user.sub,
      },
      include: { usuarios: { select: { nombre: true } } },
    });
  }

  async updateConsulta(id: number, dto: UpdateConsultaDto) {
    const consulta = await this.prisma.consultas.findUnique({ where: { id_consulta: id } });
    if (!consulta) throw new NotFoundException('Consulta no encontrada.');
    return this.prisma.consultas.update({
      where: { id_consulta: id },
      data: {
        ...(dto.motivo !== undefined && { motivo: dto.motivo }),
        ...(dto.diagnostico !== undefined && { diagnostico: dto.diagnostico }),
        ...(dto.tratamiento !== undefined && { tratamiento: dto.tratamiento }),
      },
      include: { usuarios: { select: { nombre: true } } },
    });
  }

  async removeConsulta(id: number) {
    const consulta = await this.prisma.consultas.findUnique({ where: { id_consulta: id } });
    if (!consulta) throw new NotFoundException('Consulta no encontrada.');
    await this.prisma.consultas.delete({ where: { id_consulta: id } });
    return { message: 'Consulta eliminada.' };
  }
}
