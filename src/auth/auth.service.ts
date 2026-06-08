import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
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
  ) {
    this.googleClient = new OAuth2Client(config.get('GOOGLE_CLIENT_ID'));
  }

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.usuarios.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    const roleName: RoleName = ROLES.CLIENTE;

    const rol = await this.findOrCreateRole(roleName);
    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.usuarios.create({
      data: {
        nombre: dto.nombre.trim(),
        email: normalizedEmail,
        password: hashed,
        id_rol: rol.id_rol,
      },
      include: { roles: true },
    });

    await this.createRoleProfile(user.id_usuario, user.nombre, normalizedEmail, roleName);

    const token = this.signToken(user.id_usuario, user.nombre!, normalizedEmail, roleName);
    return { token, user: this.sanitize(user.id_usuario, user.nombre!, normalizedEmail, roleName) };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.usuarios.findUnique({
      where: { email: normalizedEmail },
      include: { roles: true },
    });

    if (!user) {
      throw new UnauthorizedException('No existe una cuenta con ese correo.');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Contraseña incorrecta.');
    }

    const roleName = (user.roles?.nombre ?? ROLES.CLIENTE) as RoleName;

    // Crear perfil si por alguna razón no existe aún
    await this.ensureRoleProfile(user.id_usuario, user.nombre, normalizedEmail, roleName);

    const token = this.signToken(user.id_usuario, user.nombre!, normalizedEmail, roleName);
    return { token, user: this.sanitize(user.id_usuario, user.nombre!, normalizedEmail, roleName) };
  }

  async googleAuth(dto: GoogleAuthDto) {
    let ticket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      });
    } catch {
      throw new UnauthorizedException('Token de Google inválido o expirado.');
    }

    const payload = ticket.getPayload();
    if (!payload?.email) throw new UnauthorizedException('Token de Google sin email.');

    const normalizedEmail = payload.email.trim().toLowerCase();
    let user = await this.prisma.usuarios.findUnique({
      where: { email: normalizedEmail },
      include: { roles: true },
    });

    if (!user) {
      const rol = await this.findOrCreateRole(ROLES.CLIENTE);
      user = await this.prisma.usuarios.create({
        data: {
          nombre: (payload.name ?? normalizedEmail).trim(),
          email: normalizedEmail,
          password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
          id_rol: rol.id_rol,
        },
        include: { roles: true },
      });
      await this.createRoleProfile(user.id_usuario, user.nombre, normalizedEmail, ROLES.CLIENTE);
    }

    const roleName = (user.roles?.nombre ?? ROLES.CLIENTE) as RoleName;
    const token = this.signToken(user.id_usuario, user.nombre!, normalizedEmail, roleName);
    return { token, user: this.sanitize(user.id_usuario, user.nombre!, normalizedEmail, roleName) };
  }

  async me(userId: number) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id_usuario: userId },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const roleName = (user.roles?.nombre ?? ROLES.CLIENTE) as RoleName;
    return this.sanitize(user.id_usuario, user.nombre!, user.email, roleName);
  }

  private async createRoleProfile(
    id_usuario: number,
    nombre: string | null,
    email: string,
    role: RoleName,
  ) {
    if (role === ROLES.CLIENTE) {
      await this.prisma.propietarios.create({
        data: { nombre, email, id_usuario },
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
  ) {
    if (role === ROLES.CLIENTE) {
      const exists = await this.prisma.propietarios.findUnique({ where: { id_usuario } });
      if (!exists) await this.prisma.propietarios.create({ data: { nombre, email, id_usuario } });
    } else if (role === ROLES.VETERINARIO) {
      const exists = await this.prisma.veterinarios.findUnique({ where: { id_usuario } });
      if (!exists) await this.prisma.veterinarios.create({ data: { id_usuario } });
    }
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.usuarios.findUnique({
      where: { email: normalizedEmail },
    });

    // Respuesta idéntica si el usuario existe o no — evita user enumeration
    if (!user) return { message: 'Si el correo está registrado, recibirás un enlace de recuperación.' };

    const payload: ResetTokenPayload = { sub: user.id_usuario, type: 'reset' };
    // El secreto incluye el hash actual de la contraseña — al cambiarla el token queda inválido
    const resetSecret = this.config.get<string>('JWT_SECRET')! + user.password;
    const resetToken = this.jwt.sign(payload, { secret: resetSecret, expiresIn: '1h' });

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.mail.sendPasswordReset(normalizedEmail, user.nombre ?? 'Usuario', resetLink);

    return { message: 'Si el correo está registrado, recibirás un enlace de recuperación.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    // Decodificar sin verificar para obtener el sub y buscar al usuario
    let unverified: ResetTokenPayload;
    try {
      unverified = this.jwt.decode(token) as ResetTokenPayload;
    } catch {
      throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado.');
    }

    if (!unverified?.sub || unverified.type !== 'reset') {
      throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado.');
    }

    const user = await this.prisma.usuarios.findUnique({ where: { id_usuario: unverified.sub } });
    if (!user) throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado.');

    // Verificar con el secreto que incluye el hash actual — falla si la contraseña ya cambió
    const resetSecret = this.config.get<string>('JWT_SECRET')! + user.password;
    try {
      this.jwt.verify<ResetTokenPayload>(token, { secret: resetSecret });
    } catch {
      throw new UnauthorizedException('El enlace de recuperación es inválido o ha expirado.');
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

  private signToken(id: number, name: string, email: string, role: RoleName) {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: id, name, email, role };
    return this.jwt.sign(payload);
  }

  private sanitize(id: number, name: string, email: string, role: RoleName) {
    return { id, name, email, role };
  }
}
