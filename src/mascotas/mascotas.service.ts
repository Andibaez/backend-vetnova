import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { CreateMascotaDto } from './dto/create.mascota.dto';
import { UpdateMascotaDto } from './dto/update.mascotas.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import { tenantWhere } from '../common/utils/tenant.util';
import {
  PaginationDto,
  paginate,
  paginatedResponse,
} from '../common/dto/pagination.dto';

@Injectable()
export class MascotasService {
  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  async create(dto: CreateMascotaDto, user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop)
        throw new ForbiddenException('No tienes un perfil de propietario.');
      if (prop.id_clinica !== clinicaId) {
        throw new ForbiddenException('Tu perfil no pertenece a esta clínica.');
      }
      if (dto.id_propietario && dto.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException(
          'Solo puedes registrar mascotas a tu propio perfil.',
        );
      }
      dto.id_propietario = prop.id_propietario;
    } else if (dto.id_propietario !== undefined) {
      const propietario = await this.prisma.propietarios.findUnique({
        where: { id_propietario: dto.id_propietario },
      });
      if (!propietario) throw new BadRequestException('Propietario no existe');
      if (propietario.id_clinica !== clinicaId) {
        throw new ForbiddenException(
          'El propietario no pertenece a tu clínica.',
        );
      }
    }

    const mascota = await this.prisma.mascotas.create({
      data: { ...dto, id_clinica: clinicaId },
    });

    if (user.role === ROLES.CLIENTE) {
      await this.notificaciones.crearParaAdmins(
        'Nueva mascota registrada',
        `${user.name} registró a ${mascota.nombre ?? 'una mascota'} (${mascota.especie ?? 'sin especie'}) en su perfil.`,
        'nueva_mascota',
        clinicaId,
        user.sub,
        mascota.id_mascota,
        'mascota',
      );
    }

    return mascota;
  }

  async findAll(
    user: JwtPayload,
    id_propietario?: number,
    pagination: PaginationDto = {},
  ) {
    const { take, skip } = paginate(pagination.page, pagination.limit);

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop) return paginatedResponse([], 0, 1, pagination.limit ?? 20);
      const where = {
        id_propietario: prop.id_propietario,
        ...tenantWhere(user),
      };
      const [mascotas, total] = await Promise.all([
        this.prisma.mascotas.findMany({
          where,
          include: { propietario: true },
          take,
          skip,
        }),
        this.prisma.mascotas.count({ where }),
      ]);
      return paginatedResponse(
        mascotas,
        total,
        pagination.page ?? 1,
        pagination.limit ?? 20,
      );
    }

    const where = {
      ...(id_propietario ? { id_propietario } : {}),
      ...tenantWhere(user),
    };
    const [mascotas, total] = await Promise.all([
      this.prisma.mascotas.findMany({
        where: Object.keys(where).length ? where : undefined,
        include: { propietario: true },
        take,
        skip,
      }),
      this.prisma.mascotas.count({
        where: Object.keys(where).length ? where : undefined,
      }),
    ]);
    return paginatedResponse(
      mascotas,
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  async findOne(id: number, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
      include: { propietario: true },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      mascota.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Mascota no encontrada');
    }
    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop || mascota.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException(
          'No tienes permiso para ver esta mascota.',
        );
      }
    }
    return mascota;
  }

  async updateMascota(id: number, dto: UpdateMascotaDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
    });
    if (!mascota) throw new NotFoundException('Mascota no existe');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      mascota.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Mascota no existe');
    }
    if (user.role === ROLES.CLIENTE) {
      throw new ForbiddenException(
        'Los clientes no pueden modificar mascotas directamente.',
      );
    }
    if (dto.id_propietario !== undefined) {
      const propietario = await this.prisma.propietarios.findUnique({
        where: { id_propietario: dto.id_propietario },
      });
      if (
        !propietario ||
        propietario.id_clinica !== this.requireClinicaId(user)
      ) {
        throw new ForbiddenException(
          'El propietario no pertenece a tu clínica.',
        );
      }
    }
    return this.prisma.mascotas.update({
      where: { id_mascota: id },
      data: dto,
    });
  }

  async deleteMascota(id: number, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
    });
    if (!mascota) throw new NotFoundException('Mascota no existe');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      mascota.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Mascota no existe');
    }

    await this.prisma.$transaction([
      // Consultas dependen de historias_clinicas → eliminar primero
      this.prisma.consultas.deleteMany({
        where: { historias_clinicas: { id_mascota: id } },
      }),
      this.prisma.historias_clinicas.deleteMany({ where: { id_mascota: id } }),
      this.prisma.recordatorios.deleteMany({ where: { id_mascota: id } }),
      this.prisma.registro_vacunas.deleteMany({ where: { id_mascota: id } }),
      // Facturas y citas se desvinculan (registros históricos se conservan)
      this.prisma.facturas.updateMany({
        where: { id_mascota: id },
        data: { id_mascota: null },
      }),
      this.prisma.citas.updateMany({
        where: { id_mascota: id },
        data: { id_mascota: null },
      }),
      this.prisma.mascotas.delete({ where: { id_mascota: id } }),
    ]);

    return { message: 'Mascota eliminada.' };
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }
}
