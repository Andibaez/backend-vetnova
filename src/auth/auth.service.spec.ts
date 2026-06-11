import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

const mockPrisma = {
  usuarios: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  roles: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  propietarios: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  veterinarios: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock.jwt.token'),
  verify: jest.fn(),
  decode: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('mock-secret'),
  getOrThrow: jest.fn().mockReturnValue('mock-secret'),
};

const mockMail = { sendPasswordReset: jest.fn() };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── register ────────────────────────────────────────────────

  describe('register', () => {
    it('lanza ConflictException si el email ya existe', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({ id_usuario: 1, email: 'a@b.com' });
      await expect(
        service.register({ nombre: 'Test', email: 'a@b.com', password: 'Pass1@test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('siempre asigna rol Cliente sin importar lo que venga', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({ id_rol: 3, nombre: 'Cliente' });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 1, nombre: 'Test', email: 'a@b.com',
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});

      const result = await service.register({ nombre: 'Test', email: 'a@b.com', password: 'Pass1@test' });

      expect(result.user.role).toBe('Cliente');
      expect(mockPrisma.roles.findUnique).toHaveBeenCalledWith({ where: { nombre: 'Cliente' } });
    });

    it('normaliza el email a minúsculas', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({ id_rol: 3, nombre: 'Cliente' });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 1, nombre: 'Test', email: 'test@example.com',
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});

      await service.register({ nombre: 'Test', email: 'TEST@EXAMPLE.COM', password: 'Pass1@test' });

      expect(mockPrisma.usuarios.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('crea perfil de propietario para rol Cliente', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({ id_rol: 3, nombre: 'Cliente' });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 5, nombre: 'Test', email: 'a@b.com',
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});

      await service.register({ nombre: 'Test', email: 'a@b.com', password: 'Pass1@test' });

      expect(mockPrisma.propietarios.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ id_usuario: 5 }) }),
      );
    });
  });

  // ── login ────────────────────────────────────────────────────

  describe('login', () => {
    it('lanza UnauthorizedException si el email no existe', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'noexiste@b.com', password: 'Pass1@test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const hashed = await bcrypt.hash('CorrectPass1@', 10);
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1, nombre: 'Test', email: 'a@b.com',
        password: hashed, roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.findUnique.mockResolvedValue({ id_propietario: 1 });

      await expect(
        service.login({ email: 'a@b.com', password: 'WrongPass1@' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('retorna token y datos del usuario en login exitoso', async () => {
      const hashed = await bcrypt.hash('Pass1@test', 10);
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1, nombre: 'Test', email: 'a@b.com',
        password: hashed, roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.findUnique.mockResolvedValue({ id_propietario: 1 });

      const result = await service.login({ email: 'a@b.com', password: 'Pass1@test' });

      expect(result.token).toBe('mock.jwt.token');
      expect(result.user.email).toBe('a@b.com');
    });
  });

  // ── forgotPassword ───────────────────────────────────────────

  describe('forgotPassword', () => {
    it('responde igual si el email no existe (evita user enumeration)', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword('noexiste@b.com');
      expect(result.message).toContain('Si el correo está registrado');
      expect(mockMail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('envía email si el usuario existe', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1, nombre: 'Test', email: 'a@b.com', password: 'hashed',
      });
      mockMail.sendPasswordReset.mockResolvedValue(undefined);

      await service.forgotPassword('a@b.com');

      expect(mockMail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com', 'Test', expect.stringContaining('reset-password'),
      );
    });
  });

  // ── resetPassword ────────────────────────────────────────────

  describe('resetPassword', () => {
    it('lanza UnauthorizedException con token inválido', async () => {
      mockJwt.decode.mockReturnValue(null);
      await expect(service.resetPassword('token-invalido', 'NuevaPass1@')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si el type no es reset', async () => {
      mockJwt.decode.mockReturnValue({ sub: 1, type: 'auth' });
      await expect(service.resetPassword('token-auth', 'NuevaPass1@')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si la verificación con secreto falla', async () => {
      mockJwt.decode.mockReturnValue({ sub: 1, type: 'reset' });
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1, password: 'hashed_old',
      });
      mockJwt.verify.mockImplementation(() => { throw new Error('invalid'); });

      await expect(service.resetPassword('token-expirado', 'NuevaPass1@')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('actualiza la contraseña con token válido', async () => {
      mockJwt.decode.mockReturnValue({ sub: 1, type: 'reset' });
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1, password: 'hashed_old',
      });
      mockJwt.verify.mockReturnValue({ sub: 1, type: 'reset' });
      mockPrisma.usuarios.update.mockResolvedValue({});

      const result = await service.resetPassword('token-valido', 'NuevaPass1@');

      expect(mockPrisma.usuarios.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_usuario: 1 } }),
      );
      expect(result.message).toContain('actualizada');
    });
  });
});
