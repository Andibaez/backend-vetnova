import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServicioDto } from './dto/create-servicio.dto';
import { UpdateServicioDto } from './dto/update-servicio.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class ServiciosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtPayload) {
    const where =
      user.role === ROLES.SUPER_ADMIN
        ? {}
        : { id_clinica: this.requireClinicaId(user) };
    return this.prisma.servicios.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const servicio = await this.prisma.servicios.findUnique({
      where: { id_servicio: id },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado.');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      servicio.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    return servicio;
  }

  create(dto: CreateServicioDto, user: JwtPayload) {
    return this.prisma.servicios.create({
      data: { ...dto, id_clinica: this.requireClinicaId(user) },
    });
  }

  async update(id: number, dto: UpdateServicioDto, user: JwtPayload) {
    await this.findOne(id, user);
    return this.prisma.servicios.update({
      where: { id_servicio: id },
      data: dto,
    });
  }

  async remove(id: number, user: JwtPayload) {
    await this.findOne(id, user);
    await this.prisma.servicios.delete({ where: { id_servicio: id } });
    return { message: 'Servicio eliminado.' };
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }
}
