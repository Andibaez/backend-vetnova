import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateClinicaDto } from './dto/create-clinica.dto';
import { UpdateClinicaDto } from './dto/update-clinica.dto';
import { ChangeAdminDto } from './dto/change-admin.dto';
import { ROLES } from '../common/constants/roles.constant';
import {
  PaginationDto,
  paginate,
  paginatedResponse,
} from '../common/dto/pagination.dto';

const ADMIN_SELECT = {
  id_usuario: true,
  nombre: true,
  email: true,
} as const;

/** Genera una contraseña temporal aleatoria que cumple la política de complejidad. */
function generateTemporaryPassword(): string {
  const special = '!@#$%^&*';
  const random = randomBytes(9).toString('base64url'); // letras/números mixtos
  const upper = 'A';
  const digit = String(Math.floor(Math.random() * 10));
  const symbol = special[Math.floor(Math.random() * special.length)];
  return `${upper}${random}${digit}${symbol}`;
}

@Injectable()
export class ClinicasService {
  private readonly logger = new Logger(ClinicasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async findAll() {
    return this.prisma.clinicas.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number) {
    const clinica = await this.prisma.clinicas.findFirst({
      where: { id_clinica: id },
      include: {
        usuarios: {
          where: { roles: { nombre: ROLES.ADMIN } },
          select: ADMIN_SELECT,
          take: 1,
        },
      },
    });
    if (!clinica) throw new NotFoundException('Clínica no encontrada.');
    const { usuarios, ...rest } = clinica;
    const admin = usuarios[0] ?? null;
    return {
      ...rest,
      admin: admin
        ? { id: admin.id_usuario, nombre: admin.nombre, email: admin.email }
        : null,
    };
  }

  async findActivas() {
    return this.prisma.clinicas.findMany({
      where: { estado: 'activa' },
      select: {
        nombre: true,
        slug: true,
        direccion: true,
        latitud: true,
        longitud: true,
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const clinica = await this.prisma.clinicas.findUnique({
      where: { slug },
      select: { id_clinica: true, nombre: true, slug: true, estado: true },
    });
    if (!clinica) throw new NotFoundException('Clínica no encontrada.');
    return clinica;
  }

  async create(dto: CreateClinicaDto) {
    const existingSlug = await this.prisma.clinicas.findUnique({
      where: { slug: dto.slug },
    });
    if (existingSlug)
      throw new ConflictException('Ya existe una clínica con ese slug.');

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const existingAdmin = await this.prisma.usuarios.findFirst({
      where: { email: adminEmail },
    });
    if (existingAdmin)
      throw new ConflictException('Ya existe un usuario con ese correo.');

    // Si no se proporciona contraseña manual (flujo MP-09), se genera una
    // temporal aleatoria y se envía por correo; si se proporciona, se respeta
    // (compatibilidad con flujos previos que la envían explícitamente).
    const tempPassword = dto.adminPassword ?? generateTemporaryPassword();
    const adminNombre = (dto.adminNombre ?? adminEmail.split('@')[0]).trim();
    const hashed = await bcrypt.hash(tempPassword, 10);
    const isGenerated = !dto.adminPassword;

    const clinica = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicas.create({
        data: {
          nombre: dto.nombre.trim(),
          slug: dto.slug.trim().toLowerCase(),
          direccion: dto.direccion,
          telefono: dto.telefono,
          email: dto.email,
          latitud: dto.latitud,
          longitud: dto.longitud,
        },
      });

      let rolAdmin = await tx.roles.findUnique({
        where: { nombre: ROLES.ADMIN },
      });
      if (!rolAdmin)
        rolAdmin = await tx.roles.create({ data: { nombre: ROLES.ADMIN } });

      await tx.usuarios.create({
        data: {
          nombre: adminNombre,
          email: adminEmail,
          password: hashed,
          id_rol: rolAdmin.id_rol,
          id_clinica: created.id_clinica,
        },
      });

      return created;
    });

    if (isGenerated) {
      // No bloquea la respuesta: la clínica ya quedó creada, el correo es secundario.
      void this.mail.sendTemporaryPassword(adminEmail, {
        nombre: adminNombre,
        tempPassword,
        clinica: clinica.nombre,
      });
      this.logger.log(
        `Contraseña temporal generada para el admin de la clínica ${clinica.id_clinica}.`,
      );
    }

    return clinica;
  }

  async update(id: number, dto: UpdateClinicaDto) {
    await this.findOne(id);
    return this.prisma.clinicas.update({
      where: { id_clinica: id },
      data: dto,
    });
  }

  /**
   * Reasigna el administrador de una clínica. Si el correo del nuevo
   * administrador no corresponde a un usuario existente, se crea con una
   * contraseña temporal (mismo flujo que MP-09) y se le notifica por correo.
   * Registra el cambio en `admin_history` para auditoría.
   */
  async changeAdmin(
    clinicaId: number,
    dto: ChangeAdminDto,
    changedByUserId: number,
  ) {
    const clinica = await this.prisma.clinicas.findUnique({
      where: { id_clinica: clinicaId },
    });
    if (!clinica) throw new NotFoundException('Clínica no encontrada.');

    const newAdminEmail = dto.newAdminEmail.trim().toLowerCase();

    const previousAdmin = await this.prisma.usuarios.findFirst({
      where: { id_clinica: clinicaId, roles: { nombre: ROLES.ADMIN } },
    });

    let rolAdmin = await this.prisma.roles.findUnique({
      where: { nombre: ROLES.ADMIN },
    });
    if (!rolAdmin)
      rolAdmin = await this.prisma.roles.create({
        data: { nombre: ROLES.ADMIN },
      });

    let newAdmin = await this.prisma.usuarios.findFirst({
      where: { email: newAdminEmail },
    });

    let tempPassword: string | null = null;
    let newAdminNombre = dto.newAdminNombre?.trim();

    if (!newAdmin) {
      tempPassword = generateTemporaryPassword();
      newAdminNombre = newAdminNombre || newAdminEmail.split('@')[0];
      const hashed = await bcrypt.hash(tempPassword, 10);
      newAdmin = await this.prisma.usuarios.create({
        data: {
          nombre: newAdminNombre,
          email: newAdminEmail,
          password: hashed,
          id_rol: rolAdmin.id_rol,
          id_clinica: clinicaId,
        },
      });
    } else {
      // El usuario ya existe: solo se reasigna a esta clínica y se le otorga
      // el rol Administrador si no lo tenía.
      newAdminNombre =
        newAdmin.nombre ?? newAdminNombre ?? newAdminEmail.split('@')[0];
      newAdmin = await this.prisma.usuarios.update({
        where: { id_usuario: newAdmin.id_usuario },
        data: { id_clinica: clinicaId, id_rol: rolAdmin.id_rol },
      });
    }

    if (previousAdmin && previousAdmin.id_usuario !== newAdmin.id_usuario) {
      // El admin anterior pierde la asignación a esta clínica como administrador.
      await this.prisma.usuarios.update({
        where: { id_usuario: previousAdmin.id_usuario },
        data: { id_clinica: null },
      });
    }

    await this.prisma.admin_history.create({
      data: {
        clinica_id: clinicaId,
        previous_admin_id: previousAdmin?.id_usuario ?? null,
        new_admin_id: newAdmin.id_usuario,
        changed_by: changedByUserId,
      },
    });

    if (tempPassword) {
      // No bloquea la respuesta: el cambio de admin ya quedó registrado.
      void this.mail.sendTemporaryPassword(newAdminEmail, {
        nombre: newAdminNombre ?? newAdminEmail.split('@')[0],
        tempPassword,
        clinica: clinica.nombre,
      });
      this.logger.log(
        `Contraseña temporal generada para el nuevo admin de la clínica ${clinicaId}.`,
      );
    }

    return this.findOne(clinicaId);
  }

  /** Lista paginada del historial de cambios de administrador de una clínica. */
  async getAdminHistory(clinicaId: number, pagination: PaginationDto = {}) {
    await this.findOne(clinicaId);
    const { take, skip } = paginate(pagination.page, pagination.limit);
    const [data, total] = await Promise.all([
      this.prisma.admin_history.findMany({
        where: { clinica_id: clinicaId },
        include: {
          previous_admin: { select: ADMIN_SELECT },
          new_admin: { select: ADMIN_SELECT },
          changed_by_usuario: { select: ADMIN_SELECT },
        },
        orderBy: { changed_at: 'desc' },
        take,
        skip,
      }),
      this.prisma.admin_history.count({ where: { clinica_id: clinicaId } }),
    ]);

    return paginatedResponse(
      data.map((row) => ({
        id: row.id,
        changedAt: row.changed_at,
        previousAdmin: row.previous_admin
          ? {
              id: row.previous_admin.id_usuario,
              nombre: row.previous_admin.nombre,
              email: row.previous_admin.email,
            }
          : null,
        newAdmin: {
          id: row.new_admin.id_usuario,
          nombre: row.new_admin.nombre,
          email: row.new_admin.email,
        },
        changedBy: {
          id: row.changed_by_usuario.id_usuario,
          nombre: row.changed_by_usuario.nombre,
          email: row.changed_by_usuario.email,
        },
      })),
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }
}
