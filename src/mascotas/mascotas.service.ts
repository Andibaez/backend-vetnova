import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMascotaDto } from './dto/create.mascota.dto';
import { UpdateMascotaDto } from './dto/update.mascotas.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import { PaginationDto, paginate, paginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class MascotasService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMascotaDto) {
    if (dto.id_propietario !== undefined) {
      const propietario = await this.prisma.propietarios.findUnique({
        where: { id_propietario: dto.id_propietario },
      });
      if (!propietario) throw new BadRequestException('Propietario no existe');
    }
    return this.prisma.mascotas.create({ data: dto });
  }

  async findAll(user: JwtPayload, id_propietario?: number, pagination: PaginationDto = {}) {
    const { take, skip } = paginate(pagination.page, pagination.limit);

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop) return paginatedResponse([], 0, 1, pagination.limit ?? 20);
      const where = { id_propietario: prop.id_propietario };
      const [mascotas, total] = await Promise.all([
        this.prisma.mascotas.findMany({ where, include: { propietario: true }, take, skip }),
        this.prisma.mascotas.count({ where }),
      ]);
      return paginatedResponse(mascotas, total, pagination.page ?? 1, pagination.limit ?? 20);
    }

    const where = id_propietario ? { id_propietario } : undefined;
    const [mascotas, total] = await Promise.all([
      this.prisma.mascotas.findMany({ where, include: { propietario: true }, take, skip }),
      this.prisma.mascotas.count({ where }),
    ]);
    return paginatedResponse(mascotas, total, pagination.page ?? 1, pagination.limit ?? 20);
  }

  async findOne(id: number, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
      include: { propietario: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop || mascota.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('No tienes permiso para ver esta mascota.');
      }
    }
    return mascota;
  }

  async updateMascota(id: number, dto: UpdateMascotaDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota: id } });
    if (!mascota) throw new NotFoundException('Mascota no existe');
    if (user.role === ROLES.CLIENTE) {
      throw new ForbiddenException('Los clientes no pueden modificar mascotas directamente.');
    }
    return this.prisma.mascotas.update({ where: { id_mascota: id }, data: dto });
  }

  async deleteMascota(id: number) {
    const mascota = await this.prisma.mascotas.findUnique({ where: { id_mascota: id } });
    if (!mascota) throw new NotFoundException('Mascota no existe');
    return this.prisma.mascotas.delete({ where: { id_mascota: id } });
  }
}
