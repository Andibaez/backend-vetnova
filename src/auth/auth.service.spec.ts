import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import * as bcrypt from 'bcrypt';

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

interface UsuarioCreateArgs {
  data: { email_verificado: boolean };
}

interface MascotaUpdateArgs {
  where: { id_mascota: number };
  data: { id_clinica: number; resumen_clinicas_anteriores: unknown };
}

interface ConsultasUpdateManyArgs {
  where: { id_historia: number; eliminada_at: null };
  data: { archivada_por_migracion: boolean };
}

interface RegistroVacunasUpdateManyArgs {
  where: { id_mascota: number };
  data: { archivada_por_migracion: boolean };
}

const mockPrisma = {
  usuarios: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn<unknown, [UsuarioCreateArgs]>(),
    update: jest.fn(),
  },
  roles: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  propietarios: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  veterinarios: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  clinicas: {
    findUnique: jest.fn(),
  },
  mascotas: {
    findMany: jest.fn(),
    update: jest.fn<unknown, [MascotaUpdateArgs]>(),
  },
  consultas: {
    updateMany: jest.fn<unknown, [ConsultasUpdateManyArgs]>(),
  },
  registro_vacunas: {
    updateMany: jest.fn<unknown, [RegistroVacunasUpdateManyArgs]>(),
  },
  $transaction: jest.fn(),
};

const clinicaTest = {
  id_clinica: 1,
  nombre: 'Clínica Test',
  slug: 'test-clinic',
  estado: 'activa',
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

const mockMail = {
  sendPasswordReset: jest.fn(),
  sendWelcome: jest.fn(),
  sendVerifyEmail: jest.fn(),
  sendAppointmentConfirmation: jest.fn(),
  sendAppointmentReminder: jest.fn(),
  sendAppointmentCancelled: jest.fn(),
  sendNewClientNotice: jest.fn(),
  sendClientMigratedNotice: jest.fn(),
};

const mockNotificaciones = {
  crearParaUsuario: jest.fn(),
  crearParaAdmins: jest.fn(),
};

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
        { provide: NotificacionesService, useValue: mockNotificaciones },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(mockPrisma),
    );
    // Default: sin administradores que notificar, salvo que el test lo sobreescriba.
    mockPrisma.usuarios.findMany.mockResolvedValue([]);
  });

  // ── register ────────────────────────────────────────────────

  describe('register', () => {
    it('lanza ConflictException si el email ya existe en esa clínica', async () => {
      mockPrisma.clinicas.findUnique.mockResolvedValue(clinicaTest);
      mockPrisma.usuarios.findFirst.mockResolvedValue({
        id_usuario: 1,
        email: 'a@b.com',
      });
      await expect(
        service.register({
          nombre: 'Test',
          email: 'a@b.com',
          password: 'Pass1@test',
          clinicaSlug: 'test-clinic',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('siempre asigna rol Cliente sin importar lo que venga', async () => {
      mockPrisma.clinicas.findUnique.mockResolvedValue(clinicaTest);
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({
        id_rol: 3,
        nombre: 'Cliente',
      });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 1,
        nombre: 'Test',
        email: 'a@b.com',
        id_clinica: 1,
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});

      const result = await service.register({
        nombre: 'Test',
        email: 'a@b.com',
        password: 'Pass1@test',
        clinicaSlug: 'test-clinic',
      });

      expect(result.requiresEmailVerification).toBe(true);
      const createCall = mockPrisma.usuarios.create.mock.calls[0][0];
      expect(createCall.data).toMatchObject({ email_verificado: false });
      expect(mockPrisma.roles.findUnique).toHaveBeenCalledWith({
        where: { nombre: 'Cliente' },
      });
    });

    it('normaliza el email a minúsculas', async () => {
      mockPrisma.clinicas.findUnique.mockResolvedValue(clinicaTest);
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({
        id_rol: 3,
        nombre: 'Cliente',
      });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 1,
        nombre: 'Test',
        email: 'test@example.com',
        id_clinica: 1,
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});

      await service.register({
        nombre: 'Test',
        email: 'TEST@EXAMPLE.COM',
        password: 'Pass1@test',
        clinicaSlug: 'test-clinic',
      });

      expect(mockPrisma.usuarios.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@example.com', id_clinica: 1 },
      });
    });

    it('crea perfil de propietario para rol Cliente', async () => {
      mockPrisma.clinicas.findUnique.mockResolvedValue(clinicaTest);
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({
        id_rol: 3,
        nombre: 'Cliente',
      });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 5,
        nombre: 'Test',
        email: 'a@b.com',
        id_clinica: 1,
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});

      await service.register({
        nombre: 'Test',
        email: 'a@b.com',
        password: 'Pass1@test',
        clinicaSlug: 'test-clinic',
      });

      expect(mockPrisma.propietarios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            email: 'a@b.com',
            id_clinica: 1,
            id_usuario: 5,
            nombre: 'Test',
          },
        }),
      );
    });

    it('notifica por correo a los administradores de la clínica', async () => {
      mockPrisma.clinicas.findUnique.mockResolvedValue(clinicaTest);
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      mockPrisma.roles.findUnique.mockResolvedValue({
        id_rol: 3,
        nombre: 'Cliente',
      });
      mockPrisma.usuarios.create.mockResolvedValue({
        id_usuario: 5,
        nombre: 'Test',
        email: 'a@b.com',
        id_clinica: 1,
        roles: { nombre: 'Cliente' },
      });
      mockPrisma.propietarios.create.mockResolvedValue({});
      mockPrisma.usuarios.findMany.mockResolvedValue([
        { email: 'admin@clinic.com', nombre: 'Admin Clínica' },
      ]);

      await service.register({
        nombre: 'Test',
        email: 'a@b.com',
        password: 'Pass1@test',
        clinicaSlug: 'test-clinic',
      });

      expect(mockMail.sendNewClientNotice).toHaveBeenCalledWith(
        'admin@clinic.com',
        expect.objectContaining({
          adminNombre: 'Admin Clínica',
          clienteNombre: 'Test',
          clienteEmail: 'a@b.com',
        }),
      );
    });
  });

  // ── login ────────────────────────────────────────────────────

  describe('login', () => {
    it('lanza UnauthorizedException si el email no existe', async () => {
      mockPrisma.usuarios.findMany.mockResolvedValue([]);
      await expect(
        service.login({ email: 'noexiste@b.com', password: 'Pass1@test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la contraseña es incorrecta', async () => {
      const hashed = await bcrypt.hash('CorrectPass1@', 10);
      mockPrisma.usuarios.findMany.mockResolvedValue([
        {
          id_usuario: 1,
          nombre: 'Test',
          email: 'a@b.com',
          id_clinica: null,
          password: hashed,
          roles: { nombre: 'Cliente' },
          clinicas: null,
        },
      ]);
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 1,
      });

      await expect(
        service.login({ email: 'a@b.com', password: 'WrongPass1@' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el correo no fue confirmado', async () => {
      const hashed = await bcrypt.hash('Pass1@test', 10);
      mockPrisma.usuarios.findMany.mockResolvedValue([
        {
          id_usuario: 1,
          nombre: 'Test',
          email: 'a@b.com',
          id_clinica: 1,
          password: hashed,
          email_verificado: false,
          roles: { nombre: 'Cliente' },
          clinicas: clinicaTest,
        },
      ]);

      await expect(
        service.login({ email: 'a@b.com', password: 'Pass1@test' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('retorna token y datos del usuario en login exitoso', async () => {
      const hashed = await bcrypt.hash('Pass1@test', 10);
      mockPrisma.usuarios.findMany.mockResolvedValue([
        {
          id_usuario: 1,
          nombre: 'Test',
          email: 'a@b.com',
          id_clinica: 1,
          password: hashed,
          email_verificado: true,
          roles: { nombre: 'Cliente' },
          clinicas: clinicaTest,
        },
      ]);
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 1,
        id_clinica: 1,
      });

      const result = await service.login({
        email: 'a@b.com',
        password: 'Pass1@test',
      });

      if ('requiresClinicSelection' in result)
        throw new Error('unexpected clinic selection');

      expect(result.token).toBe('mock.jwt.token');
      expect(result.user.email).toBe('a@b.com');
    });
  });

  // ── cambiarClinica ───────────────────────────────────────────

  describe('cambiarClinica', () => {
    const clienteActual = {
      id_usuario: 1,
      nombre: 'Test',
      email: 'a@b.com',
      id_clinica: 1,
      roles: { nombre: 'Cliente' },
      propietarios: { id_propietario: 7, id_clinica: 1 },
    };
    const clinicaDestino = {
      id_clinica: 2,
      nombre: 'Clínica Destino',
      slug: 'destino',
      estado: 'activa',
    };

    it('lanza ForbiddenException si el usuario no es Cliente', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        ...clienteActual,
        roles: { nombre: 'Administrador' },
      });

      await expect(service.cambiarClinica(1, 'destino')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza BadRequestException si no tiene perfil de propietario', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        ...clienteActual,
        propietarios: null,
      });

      await expect(service.cambiarClinica(1, 'destino')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequestException si ya pertenece a esa clínica', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(clienteActual);
      mockPrisma.clinicas.findUnique.mockResolvedValue({
        ...clinicaDestino,
        id_clinica: 1,
      });

      await expect(service.cambiarClinica(1, 'destino')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza ConflictException si ya existe una cuenta con ese correo en la clínica destino', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(clienteActual);
      mockPrisma.clinicas.findUnique.mockResolvedValue(clinicaDestino);
      mockPrisma.usuarios.findFirst.mockResolvedValue({ id_usuario: 99 });

      await expect(service.cambiarClinica(1, 'destino')).rejects.toThrow(
        ConflictException,
      );
    });

    it('migra usuario, propietario y mascotas a la clínica destino', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(clienteActual);
      mockPrisma.clinicas.findUnique
        .mockResolvedValueOnce(clinicaDestino) // resolveClinicaBySlug
        .mockResolvedValueOnce({ nombre: 'Clínica Origen' }); // clínica origen para el resumen
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      mockPrisma.mascotas.findMany.mockResolvedValue([
        {
          id_mascota: 10,
          especie: 'Perro',
          raza: 'Labrador',
          peso: { toString: () => '12.50' },
          resumen_clinicas_anteriores: null,
          historias_clinicas: { id_historia: 5, consultas: [] },
          registro_vacunas: [],
        },
      ]);

      const result = await service.cambiarClinica(1, 'destino');

      const mascotaUpdateArgs = mockPrisma.mascotas.update.mock.calls[0][0];
      expect(mascotaUpdateArgs.where).toEqual({ id_mascota: 10 });
      expect(mascotaUpdateArgs.data.id_clinica).toBe(2);
      expect(mockPrisma.consultas.updateMany).toHaveBeenCalledWith({
        where: { id_historia: 5, eliminada_at: null },
        data: { archivada_por_migracion: true },
      });
      expect(mockPrisma.registro_vacunas.updateMany).toHaveBeenCalledWith({
        where: { id_mascota: 10 },
        data: { archivada_por_migracion: true },
      });
      expect(mockPrisma.propietarios.update).toHaveBeenCalledWith({
        where: { id_propietario: 7 },
        data: { id_clinica: 2 },
      });
      expect(mockPrisma.usuarios.update).toHaveBeenCalledWith({
        where: { id_usuario: 1 },
        data: { id_clinica: 2 },
      });
      expect(result.token).toBe('mock.jwt.token');
      expect(result.user.clinicaId).toBe(2);
    });

    it('notifica por correo a los administradores de la clínica destino', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(clienteActual);
      mockPrisma.clinicas.findUnique
        .mockResolvedValueOnce(clinicaDestino)
        .mockResolvedValueOnce({ nombre: 'Clínica Origen' });
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      mockPrisma.mascotas.findMany.mockResolvedValue([]);
      mockPrisma.usuarios.findMany.mockResolvedValue([
        { email: 'admin@destino.com', nombre: 'Admin Destino' },
      ]);

      await service.cambiarClinica(1, 'destino');

      expect(mockNotificaciones.crearParaAdmins).toHaveBeenCalledWith(
        'Cliente migrado desde otra clínica',
        expect.any(String),
        'cliente_migrado',
        2,
        1,
        1,
        'usuario',
      );
      expect(mockMail.sendClientMigratedNotice).toHaveBeenCalledWith(
        'admin@destino.com',
        expect.objectContaining({
          adminNombre: 'Admin Destino',
          clienteNombre: 'Test',
          clinicaAnterior: 'Clínica Origen',
        }),
      );
    });
  });

  // ── forgotPassword ───────────────────────────────────────────

  describe('forgotPassword', () => {
    it('responde igual si el email no existe (evita user enumeration)', async () => {
      mockPrisma.usuarios.findFirst.mockResolvedValue(null);
      const result = await service.forgotPassword('noexiste@b.com');
      expect(result.message).toContain('Si el correo está registrado');
      expect(mockMail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('envía email si el usuario existe', async () => {
      mockPrisma.usuarios.findFirst.mockResolvedValue({
        id_usuario: 1,
        nombre: 'Test',
        email: 'a@b.com',
        password: 'hashed',
      });
      mockMail.sendPasswordReset.mockResolvedValue(undefined);

      await service.forgotPassword('a@b.com');

      expect(mockMail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        'Test',
        expect.stringContaining('reset-password'),
      );
    });
  });

  // ── resetPassword ────────────────────────────────────────────

  describe('resetPassword', () => {
    it('lanza UnauthorizedException con token inválido', async () => {
      mockJwt.decode.mockReturnValue(null);
      await expect(
        service.resetPassword('token-invalido', 'NuevaPass1@'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el type no es reset', async () => {
      mockJwt.decode.mockReturnValue({ sub: 1, type: 'auth' });
      await expect(
        service.resetPassword('token-auth', 'NuevaPass1@'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si la verificación con secreto falla', async () => {
      mockJwt.decode.mockReturnValue({ sub: 1, type: 'reset' });
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1,
        password: 'hashed_old',
      });
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(
        service.resetPassword('token-expirado', 'NuevaPass1@'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('actualiza la contraseña con token válido', async () => {
      mockJwt.decode.mockReturnValue({ sub: 1, type: 'reset' });
      mockPrisma.usuarios.findUnique.mockResolvedValue({
        id_usuario: 1,
        password: 'hashed_old',
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
