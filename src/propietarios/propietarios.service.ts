import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CreatePropietarioDto } from './dto/create-propietario.dto';
import { UpdatePropietarioDto } from './dto/update-propietario.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class PropietariosService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  create(dto: CreatePropietarioDto, user: JwtPayload) {
    return this.prisma.propietarios.create({ data: { ...dto, id_clinica: this.requireClinicaId(user) } });
  }

  async findAll(user: JwtPayload, id_usuario?: number) {
    const clinicaFilter = user.role === ROLES.SUPER_ADMIN ? {} : { id_clinica: this.requireClinicaId(user) };

    if (user.role === ROLES.CLIENTE) {
      return this.prisma.propietarios.findMany({
        where: { id_usuario: user.sub, ...clinicaFilter },
        include: { mascotas: true },
      });
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({ where: { id_usuario: user.sub } });
      if (!vet) return [];
      return this.prisma.propietarios.findMany({
        where: {
          mascotas: { some: { citas: { some: { id_veterinario: vet.id_veterinario } } } },
          ...clinicaFilter,
        },
        include: { mascotas: true },
      });
    }

    return this.prisma.propietarios.findMany({
      where: { ...(id_usuario ? { id_usuario } : {}), ...clinicaFilter },
      include: { mascotas: true },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
      include: { mascotas: true },
    });
    if (!propietario) throw new NotFoundException('Propietario no encontrado');
    if (user.role !== ROLES.SUPER_ADMIN && propietario.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Propietario no encontrado');
    }
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
    if (user.role !== ROLES.SUPER_ADMIN && propietario.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Propietario no existe');
    }
    if (user.role === ROLES.CLIENTE && propietario.id_usuario !== user.sub) {
      throw new ForbiddenException('No puedes modificar este perfil.');
    }

    const actualizado = await this.prisma.propietarios.update({ where: { id_propietario: id }, data });

    if (user.role === ROLES.CLIENTE && propietario.id_usuario) {
      await this.notificaciones.crearParaUsuario(
        propietario.id_usuario,
        'Datos de perfil actualizados',
        'Tu información de contacto fue actualizada correctamente.',
        'perfil_actualizado',
      );
    }

    return actualizado;
  }

  async deletePropietario(id: number, user: JwtPayload) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
    });
    if (!propietario) throw new NotFoundException('Propietario no existe');
    if (user.role !== ROLES.SUPER_ADMIN && propietario.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Propietario no existe');
    }

    await this.prisma.$transaction([
      // Facturas se desvinculan (registros financieros se conservan)
      this.prisma.facturas.updateMany({ where: { id_propietario: id }, data: { id_propietario: null } }),
      // mascotas.id_propietario es nullable sin onDelete explícito → SetNull automático en BD
      this.prisma.propietarios.delete({ where: { id_propietario: id } }),
    ]);

    return { message: 'Propietario eliminado.' };
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }
}
