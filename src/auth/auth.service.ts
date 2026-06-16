import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ROLES, RoleName } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

interface ResetTokenPayload {
  sub: number;
  type: 'reset';
}

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly notificaciones: NotificacionesService,
  ) {
    this.googleClient = new OAuth2Client(config.get('GOOGLE_CLIENT_ID'));
  }

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // El registro público siempre crea clientes. Otros roles se gestionan desde usuarios internos.
    const roleName: RoleName = ROLES.CLIENTE;

    const clinica = await this.resolveClinicaBySlug(dto.clinicaSlug);

    const existing = await this.prisma.usuarios.findUnique({
      where: {
        email_id_clinica: {
          email: normalizedEmail,
          id_clinica: clinica.id_clinica,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Ya existe una cuenta con ese correo en esta clínica.',
      );
    }

    const rol = await this.findOrCreateRole(roleName);
    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.usuarios.create({
      data: {
        nombre: dto.nombre.trim(),
        email: normalizedEmail,
        password: hashed,
        id_rol: rol.id_rol,
        id_clinica: clinica.id_clinica,
      },
      include: { roles: true },
    });

    await this.createRoleProfile(
      user.id_usuario,
      user.nombre,
      normalizedEmail,
      roleName,
      clinica.id_clinica,
    );

    if (roleName === ROLES.CLIENTE) {
      await this.notificaciones.crearParaUsuario(
        user.id_usuario,
        'Bienvenido a VetNova',
        `Hola ${user.nombre}, tu cuenta fue creada correctamente en ${clinica.nombre}. ¡Gracias por registrarte!`,
        'bienvenida',
      );
      await this.notificaciones.crearParaAdmins(
        'Nuevo cliente registrado',
        `${user.nombre} (${normalizedEmail}) se registró como nuevo cliente.`,
        'nuevo_cliente',
        clinica.id_clinica,
        user.id_usuario,
        user.id_usuario,
        'usuario',
      );
    }

    const token = this.signToken(
      user.id_usuario,
      user.nombre!,
      normalizedEmail,
      roleName,
      clinica.id_clinica,
    );
    return {
      token,
      user: this.sanitize(
        user.id_usuario,
        user.nombre!,
        normalizedEmail,
        roleName,
        clinica.id_clinica,
        clinica.nombre,
      ),
    };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const candidates = await this.prisma.usuarios.findMany({
      where: { email: normalizedEmail },
      include: {
        roles: true,
        clinicas: {
          select: { id_clinica: true, nombre: true, slug: true, estado: true },
        },
      },
    });

    if (candidates.length === 0) {
      throw new UnauthorizedException('No existe una cuenta con ese correo.');
    }

    const matches: typeof candidates = [];
    for (const candidate of candidates) {
      if (await bcrypt.compare(dto.password, candidate.password))
        matches.push(candidate);
    }

    if (matches.length === 0) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }

    let user = matches[0];
    if (matches.length > 1) {
      if (dto.clinicaSlug) {
        const selected = matches.find(
          (m) => m.clinicas?.slug === dto.clinicaSlug,
        );
        if (!selected) {
          throw new UnauthorizedException(
            'No tienes una cuenta en esa clínica.',
          );
        }
        user = selected;
      } else {
        return {
          requiresClinicSelection: true as const,
          clinicas: matches.map((m) => ({
            nombre: m.clinicas?.nombre ?? '',
            slug: m.clinicas?.slug ?? '',
          })),
        };
      }
    }

    const roleName = (user.roles?.nombre ?? ROLES.CLIENTE) as RoleName;
    this.assertAuthenticatedClinic(user, roleName, dto.clinicaSlug);

    // Crear perfil si por alguna razón no existe aún
    await this.ensureRoleProfile(
      user.id_usuario,
      user.nombre,
      normalizedEmail,
      roleName,
      user.id_clinica,
    );

    const token = this.signToken(
      user.id_usuario,
      user.nombre!,
      normalizedEmail,
      roleName,
      user.id_clinica,
    );
    return {
      token,
      user: this.sanitize(
        user.id_usuario,
        user.nombre!,
        normalizedEmail,
        roleName,
        user.id_clinica,
        user.clinicas?.nombre,
      ),
    };
  }

  async googleAuth(dto: GoogleAuthDto) {
    let ticket: LoginTicket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      });
    } catch {
      throw new UnauthorizedException('Token de Google inválido o expirado.');
    }

    const payload = ticket.getPayload();
    if (!payload?.email)
      throw new UnauthorizedException('Token de Google sin email.');

    const normalizedEmail = payload.email.trim().toLowerCase();
    const candidates = await this.prisma.usuarios.findMany({
      where: { email: normalizedEmail },
      include: {
        roles: true,
        clinicas: {
          select: { id_clinica: true, nombre: true, slug: true, estado: true },
        },
      },
    });

    let user = dto.clinicaSlug
      ? candidates.find((c) => c.clinicas?.slug === dto.clinicaSlug)
      : undefined;

    if (!user) {
      if (candidates.length > 0 && !dto.clinicaSlug) {
        if (candidates.length === 1) {
          user = candidates[0];
        } else {
          return {
            requiresClinicSelection: true as const,
            clinicas: candidates.map((c) => ({
              nombre: c.clinicas?.nombre ?? '',
              slug: c.clinicas?.slug ?? '',
            })),
          };
        }
      } else {
        const clinica = await this.resolveClinicaBySlug(dto.clinicaSlug);
        const rol = await this.findOrCreateRole(ROLES.CLIENTE);
        user = await this.prisma.usuarios.create({
          data: {
            nombre: (payload.name ?? normalizedEmail).trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
            id_rol: rol.id_rol,
            id_clinica: clinica.id_clinica,
          },
          include: {
            roles: true,
            clinicas: {
              select: {
                id_clinica: true,
                nombre: true,
                slug: true,
                estado: true,
              },
            },
          },
        });
        await this.createRoleProfile(
          user.id_usuario,
          user.nombre,
          normalizedEmail,
          ROLES.CLIENTE,
          clinica.id_clinica,
        );
      }
    }

    const roleName = (user.roles?.nombre ?? ROLES.CLIENTE) as RoleName;
    this.assertAuthenticatedClinic(user, roleName, dto.clinicaSlug);
    const token = this.signToken(
      user.id_usuario,
      user.nombre!,
      normalizedEmail,
      roleName,
      user.id_clinica,
    );
    return {
      token,
      user: this.sanitize(
        user.id_usuario,
        user.nombre!,
        normalizedEmail,
        roleName,
        user.id_clinica,
        user.clinicas?.nombre,
      ),
    };
  }

  async me(userId: number) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id_usuario: userId },
      include: {
        roles: true,
        clinicas: { select: { id_clinica: true, nombre: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const roleName = (user.roles?.nombre ?? ROLES.CLIENTE) as RoleName;
    return this.sanitize(
      user.id_usuario,
      user.nombre!,
      user.email,
      roleName,
      user.id_clinica,
      user.clinicas?.nombre,
    );
  }

  /**
   * Resuelve la clínica asociada a un registro a partir de su slug.
   * El SuperAdministrador no pertenece a ninguna clínica (slug ausente).
   */
  private async resolveClinicaBySlug(
    slug?: string,
  ): Promise<{ id_clinica: number; nombre: string }> {
    if (!slug) {
      throw new BadRequestException(
        'Debes registrarte a través del enlace de tu clínica.',
      );
    }
    const clinica = await this.prisma.clinicas.findUnique({
      where: { slug: slug.trim().toLowerCase() },
    });
    if (!clinica || clinica.estado !== 'activa') {
      throw new BadRequestException(
        'Enlace de registro de clínica inválido o inactivo.',
      );
    }
    return { id_clinica: clinica.id_clinica, nombre: clinica.nombre };
  }

  private async createRoleProfile(
    id_usuario: number,
    nombre: string | null,
    email: string,
    role: RoleName,
    id_clinica: number | null,
  ) {
    if (role === ROLES.CLIENTE) {
      if (!id_clinica)
        throw new BadRequestException(
          'El cliente debe tener una clínica asociada.',
        );
      await this.prisma.propietarios.create({
        data: { nombre, email, id_usuario, id_clinica },
      });
    } else if (role === ROLES.VETERINARIO) {
      await this.prisma.veterinarios.create({ data: { id_usuario } });
    }
  }

  private async ensureRoleProfile(
    id_usuario: number,
    nombre: string | null,
    email: string,
    role: RoleName,
    id_clinica: number | null,
  ) {
    if (role === ROLES.CLIENTE) {
      if (!id_clinica)
        throw new BadRequestException(
          'El cliente debe tener una clínica asociada.',
        );
      const exists = await this.prisma.propietarios.findUnique({
        where: { id_usuario },
      });
      if (!exists)
        await this.prisma.propietarios.create({
          data: { nombre, email, id_usuario, id_clinica },
        });
    } else if (role === ROLES.VETERINARIO) {
      const exists = await this.prisma.veterinarios.findUnique({
        where: { id_usuario },
      });
      if (!exists)
        await this.prisma.veterinarios.create({ data: { id_usuario } });
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.usuarios.findFirst({
      where: { email: normalizedEmail },
    });

    // Respuesta idéntica si el usuario existe o no — evita user enumeration
    if (!user)
      return {
        message:
          'Si el correo está registrado, recibirás un enlace de recuperación.',
      };

    const payload: ResetTokenPayload = { sub: user.id_usuario, type: 'reset' };
    // El secreto incluye el hash actual de la contraseña — al cambiarla el token queda inválido
    const resetSecret = this.config.get<string>('JWT_SECRET')! + user.password;
    const resetToken = this.jwt.sign(payload, {
      secret: resetSecret,
      expiresIn: '1h',
    });

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.mail.sendPasswordReset(
      normalizedEmail,
      user.nombre ?? 'Usuario',
      resetLink,
    );

    return {
      message:
        'Si el correo está registrado, recibirás un enlace de recuperación.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // Decodificar sin verificar para obtener el sub y buscar al usuario
    let unverified: ResetTokenPayload;
    try {
      unverified = this.jwt.decode(token);
    } catch {
      throw new UnauthorizedException(
        'El enlace de recuperación es inválido o ha expirado.',
      );
    }

    if (!unverified?.sub || unverified.type !== 'reset') {
      throw new UnauthorizedException(
        'El enlace de recuperación es inválido o ha expirado.',
      );
    }

    const user = await this.prisma.usuarios.findUnique({
      where: { id_usuario: unverified.sub },
    });
    if (!user)
      throw new UnauthorizedException(
        'El enlace de recuperación es inválido o ha expirado.',
      );

    // Verificar con el secreto que incluye el hash actual — falla si la contraseña ya cambió
    const resetSecret = this.config.get<string>('JWT_SECRET')! + user.password;
    try {
      this.jwt.verify<ResetTokenPayload>(token, { secret: resetSecret });
    } catch {
      throw new UnauthorizedException(
        'El enlace de recuperación es inválido o ha expirado.',
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.usuarios.update({
      where: { id_usuario: user.id_usuario },
      data: { password: hashed },
    });

    return { message: 'Contraseña actualizada correctamente.' };
  }

  private async findOrCreateRole(nombre: string) {
    let rol = await this.prisma.roles.findUnique({ where: { nombre } });
    if (!rol) {
      rol = await this.prisma.roles.create({ data: { nombre } });
    }
    return rol;
  }

  private assertAuthenticatedClinic(
    user: {
      id_clinica: number | null;
      clinicas?: {
        slug: string;
        estado: string;
        nombre?: string | null;
      } | null;
    },
    role: RoleName,
    clinicaSlug?: string,
  ) {
    if (role === ROLES.SUPER_ADMIN) return;
    if (!user.id_clinica || !user.clinicas) {
      throw new UnauthorizedException(
        'El usuario no tiene una clínica asociada.',
      );
    }
    if (
      clinicaSlug &&
      user.clinicas.slug !== clinicaSlug.trim().toLowerCase()
    ) {
      throw new UnauthorizedException(
        'No perteneces a la clínica seleccionada.',
      );
    }
    if (user.clinicas.estado !== 'activa') {
      throw new UnauthorizedException('La clínica no está activa.');
    }
  }

  private signToken(
    id: number,
    name: string,
    email: string,
    role: RoleName,
    clinicaId: number | null = null,
  ) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: id,
      name,
      email,
      role,
      clinicaId,
    };
    return this.jwt.sign(payload);
  }

  private sanitize(
    id: number,
    name: string,
    email: string,
    role: RoleName,
    clinicaId: number | null = null,
    clinicaNombre?: string,
  ) {
    return { id, name, email, role, clinicaId, clinicaNombre };
  }
}
