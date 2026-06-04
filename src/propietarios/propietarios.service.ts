import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropietarioDto } from './dto/create-propietario.dto';
import { UpdatePropietarioDto } from './dto/update-propietario.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class PropietariosService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreatePropietarioDto) {
    return this.prisma.propietarios.create({ data: dto });
  }

  findAll(user: JwtPayload) {
    const where = user.role === ROLES.CLIENTE ? { id_usuario: user.sub } : undefined;
    return this.prisma.propietarios.findMany({
      where,
      include: { mascotas: true },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
      include: { mascotas: true },
    });
    if (!propietario) throw new NotFoundException('Propietario no encontrado');
    if (user.role === ROLES.CLIENTE && propietario.id_usuario !== user.sub) {
      throw new ForbiddenException('No tienes permiso para ver este recurso.');
    }
    return propietario;
  }

  async updatePropietario(id: number, data: UpdatePropietarioDto, user: JwtPayload) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
    });
    if (!propietario) throw new NotFoundException('Propietario no existe');
    if (user.role === ROLES.CLIENTE && propietario.id_usuario !== user.sub) {
      throw new ForbiddenException('No puedes modificar este perfil.');
    }
    return this.prisma.propietarios.update({ where: { id_propietario: id }, data });
  }

  async deletePropietario(id: number) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
    });
    if (!propietario) throw new NotFoundException('Propietario no existe');
    return this.prisma.propietarios.delete({ where: { id_propietario: id } });
  }
}
