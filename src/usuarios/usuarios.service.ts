import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import * as bcrypt from 'bcrypt';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ROLES, RoleName } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { tenantWhere } from '../common/utils/tenant.util';
import { PaginationDto, paginate, paginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async findAll(user: JwtPayload, rol?: string, pagination: PaginationDto = {}) {
    const { take, skip } = paginate(pagination.page, pagination.limit);
    const where = { ...(rol ? { roles: { nombre: rol } } : {}), ...tenantWhere(user) };
    const [users, total] = await Promise.all([
      this.prisma.usuarios.findMany({ where: Object.keys(where).length ? where : undefined, include: { roles: true }, orderBy: { nombre: 'asc' }, take, skip }),
      this.prisma.usuarios.count({ where: Object.keys(where).length ? where : undefined }),
    ]);
    return paginatedResponse(users.map((u) => this.sanitize(u)), total, pagination.page ?? 1, pagination.limit ?? 20);
  }

  async findOne(id: number, user: JwtPayload) {
    const existing = await this.prisma.usuarios.findUnique({
      where: { id_usuario: id },
      include: { roles: true },
    });
    if (!existing) throw new NotFoundException('Usuario no encontrado.');
    if (user.role !== ROLES.SUPER_ADMIN && existing.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    return this.sanitize(existing);
  }

  async create(dto: CreateUsuarioDto, user: JwtPayload) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.usuarios.findFirst({
      where: { email, id_clinica: user.clinicaId },
    });
    if (existing) throw new ConflictException('Ya existe una cuenta con ese correo en esta clínica.');

    const roleName: RoleName = (dto.rol as RoleName) ?? ROLES.CLIENTE;
    const rol = await this.findOrCreateRole(roleName);
    const hashed = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.usuarios.create({
      data: { nombre: dto.nombre.trim(), email, password: hashed, id_rol: rol.id_rol, id_clinica: user.clinicaId },
      include: { roles: true },
    });
    return this.sanitize(created);
  }

  async update(id: number, dto: UpdateUsuarioDto, currentUser?: JwtPayload) {
    const existing = await this.prisma.usuarios.findUnique({ where: { id_usuario: id } });
    if (!existing) throw new NotFoundException('Usuario no encontrado.');
    if (currentUser && currentUser.role !== ROLES.SUPER_ADMIN && existing.id_clinica !== currentUser.clinicaId) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const isAdmin = currentUser?.role === ROLES.ADMIN;
    if (currentUser && !isAdmin && existing.id_usuario !== currentUser.sub) {
      throw new ForbiddenException('No puedes modificar este perfil.');
    }
    if (currentUser && !isAdmin && dto.rol) {
      throw new ForbiddenException('No puedes cambiar tu propio rol.');
    }

    const data: Record<string, unknown> = {};
    if (dto.nombre) data.nombre = dto.nombre.trim();
    if (dto.email) data.email = dto.email.trim().toLowerCase();
    if (dto.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Debes proporcionar tu contraseña actual para cambiarla.');
      }
      const valid = await bcrypt.compare(dto.currentPassword, existing.password);
      if (!valid) throw new ForbiddenException('La contraseña actual es incorrecta.');
      data.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.rol) {
      const rol = await this.findOrCreateRole(dto.rol);
      data.id_rol = rol.id_rol;
    }

    const user = await this.prisma.usuarios.update({
      where: { id_usuario: id },
      data,
      include: { roles: true },
    });

    if (currentUser?.role === ROLES.CLIENTE && currentUser.sub === id && Object.keys(data).length > 0) {
      await this.notificaciones.crearParaUsuario(
        id,
        'Datos de cuenta actualizados',
        'Tu información de cuenta fue actualizada correctamente.',
        'perfil_actualizado',
      );
    }

    return this.sanitize(user);
  }

  async remove(id: number, user: JwtPayload) {
    const existing = await this.prisma.usuarios.findUnique({ where: { id_usuario: id } });
    if (!existing) throw new NotFoundException('Usuario no encontrado.');
    if (user.role !== ROLES.SUPER_ADMIN && existing.id_clinica !== user.clinicaId) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Si el usuario es veterinario, desvincular sus citas antes de eliminar el perfil
      const vet = await tx.veterinarios.findUnique({ where: { id_usuario: id } });
      if (vet) {
        await tx.citas.updateMany({
          where: { id_veterinario: vet.id_veterinario },
          data: { id_veterinario: null },
        });
      }

      await tx.recepcionistas.deleteMany({ where: { id_usuario: id } });
      await tx.veterinarios.deleteMany({ where: { id_usuario: id } });
      await tx.citas.updateMany({ where: { id_usuario: id }, data: { id_usuario: null } });
      await tx.consultas.updateMany({ where: { id_usuario: id }, data: { id_usuario: null } });
      await tx.propietarios.updateMany({ where: { id_usuario: id }, data: { id_usuario: null } });
      await tx.usuarios.delete({ where: { id_usuario: id } });
    });

    return { message: 'Usuario eliminado.' };
  }

  private async findOrCreateRole(nombre: string) {
    let rol = await this.prisma.roles.findUnique({ where: { nombre } });
    if (!rol) rol = await this.prisma.roles.create({ data: { nombre } });
    return rol;
  }

  private sanitize(user: {
    id_usuario: number;
    nombre: string | null;
    email: string;
    roles?: { nombre: string } | null;
  }) {
    return {
      id: user.id_usuario,
      nombre: user.nombre,
      email: user.email,
      rol: user.roles?.nombre ?? ROLES.CLIENTE,
    };
  }
}
