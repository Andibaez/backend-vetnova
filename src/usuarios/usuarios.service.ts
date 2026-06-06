import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { ROLES, RoleName } from '../common/constants/roles.constant';
import { PaginationDto, paginate, paginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(rol?: string, pagination: PaginationDto = {}) {
    const { take, skip } = paginate(pagination.page, pagination.limit);
    const where = rol ? { roles: { nombre: rol } } : undefined;
    const [users, total] = await Promise.all([
      this.prisma.usuarios.findMany({ where, include: { roles: true }, orderBy: { nombre: 'asc' }, take, skip }),
      this.prisma.usuarios.count({ where }),
    ]);
    return paginatedResponse(users.map((u) => this.sanitize(u)), total, pagination.page ?? 1, pagination.limit ?? 20);
  }

  async findOne(id: number) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id_usuario: id },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return this.sanitize(user);
  }

  async create(dto: CreateUsuarioDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.usuarios.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Ya existe una cuenta con ese correo.');

    const roleName: RoleName = (dto.rol as RoleName) ?? ROLES.CLIENTE;
    const rol = await this.findOrCreateRole(roleName);
    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.usuarios.create({
      data: { nombre: dto.nombre.trim(), email, password: hashed, id_rol: rol.id_rol },
      include: { roles: true },
    });
    return this.sanitize(user);
  }

  async update(id: number, dto: UpdateUsuarioDto) {
    const existing = await this.prisma.usuarios.findUnique({ where: { id_usuario: id } });
    if (!existing) throw new NotFoundException('Usuario no encontrado.');

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
    return this.sanitize(user);
  }

  async remove(id: number) {
    const existing = await this.prisma.usuarios.findUnique({ where: { id_usuario: id } });
    if (!existing) throw new NotFoundException('Usuario no encontrado.');

    await this.prisma.$transaction([
      // Relaciones con id_usuario no nullable — deben eliminarse primero
      this.prisma.recepcionistas.deleteMany({ where: { id_usuario: id } }),
      this.prisma.veterinarios.deleteMany({ where: { id_usuario: id } }),
      // Relaciones con id_usuario nullable — se desvinculan
      this.prisma.citas.updateMany({ where: { id_usuario: id }, data: { id_usuario: null } }),
      this.prisma.consultas.updateMany({ where: { id_usuario: id }, data: { id_usuario: null } }),
      this.prisma.propietarios.updateMany({ where: { id_usuario: id }, data: { id_usuario: null } }),
      // Finalmente eliminar el usuario
      this.prisma.usuarios.delete({ where: { id_usuario: id } }),
    ]);

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
