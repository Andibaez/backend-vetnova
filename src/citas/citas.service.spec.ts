import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CitasService } from './citas.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { MailService } from '../mail/mail.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  citas: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    updateMany: jest.fn(),
  },
  mascotas: { findUnique: jest.fn() },
  propietarios: { findUnique: jest.fn() },
  veterinarios: { findUnique: jest.fn(), findFirst: jest.fn() },
  usuarios: { findUnique: jest.fn() },
};

const mockNotificaciones = {
  crearParaAdmins: jest.fn(),
  crearParaUsuario: jest.fn(),
};

const mockMail = {
  sendAppointmentConfirmation: jest.fn(),
  sendAppointmentReminder: jest.fn(),
  sendAppointmentCancelled: jest.fn(),
  sendAppointmentRescheduled: jest.fn(),
  sendAppointmentNoShow: jest.fn(),
  sendWelcome: jest.fn(),
};

const adminUser = {
  sub: 1,
  role: ROLES.ADMIN,
  name: 'Admin',
  email: 'admin@test.com',
  clinicaId: 1,
};
const clienteUser = {
  sub: 2,
  role: ROLES.CLIENTE,
  name: 'Cliente',
  email: 'cliente@test.com',
  clinicaId: 1,
};
const vetUser = {
  sub: 3,
  role: ROLES.VETERINARIO,
  name: 'Vet',
  email: 'vet@test.com',
  clinicaId: 1,
};

const mascota = { id_mascota: 10, id_propietario: 5, id_clinica: 1 };
const propietario = { id_propietario: 5, id_usuario: 2, id_clinica: 1 };
const citaBase = {
  id_cita: 1,
  id_mascota: 10,
  id_usuario: 2,
  id_veterinario: null,
  id_clinica: 1,
  fecha: new Date(),
  hora: '10:00',
  estado: 'pendiente',
  mascotas: { nombre: 'Firulais', propietario },
  usuarios: { id_usuario: 2, nombre: 'Cliente', email: 'cliente@test.com' },
  veterinarios: null,
};

describe('CitasService', () => {
  let service: CitasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CitasService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificacionesService, useValue: mockNotificaciones },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    service = module.get<CitasService>(CitasService);
    jest.clearAllMocks();
    mockPrisma.usuarios.findUnique.mockResolvedValue({ id_clinica: 1 });
  });

  // ── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('lanza BadRequestException si la mascota no existe', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          { fecha: '2026-07-01', hora: '10:00', id_mascota: 99 },
          clienteUser,
        ),
      ).rejects.toThrow();
    });

    it('cliente no puede crear cita para mascota de otro propietario', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue({
        id_mascota: 10,
        id_propietario: 999,
        id_clinica: 1,
      });
      mockPrisma.propietarios.findUnique.mockResolvedValue(propietario);

      await expect(
        service.create(
          { fecha: '2026-07-01', hora: '10:00', id_mascota: 10 },
          clienteUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cliente crea cita para su propia mascota exitosamente', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
      mockPrisma.propietarios.findUnique.mockResolvedValue(propietario);
      mockPrisma.citas.create.mockResolvedValue(citaBase);
      mockNotificaciones.crearParaAdmins.mockResolvedValue(undefined);

      const result = await service.create(
        { fecha: '2026-07-01', hora: '10:00', id_mascota: 10 },
        clienteUser,
      );

      expect(result).toBeDefined();
      expect(mockNotificaciones.crearParaAdmins).toHaveBeenCalled();
    });

    it('notifica al veterinario cuando se le asigna una cita', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
      mockPrisma.propietarios.findUnique.mockResolvedValue(propietario);
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
        id_usuario: 3,
        usuarios: { id_clinica: 1 },
      });
      mockPrisma.citas.create.mockResolvedValue({
        ...citaBase,
        id_veterinario: 7,
      });
      mockNotificaciones.crearParaAdmins.mockResolvedValue(undefined);
      mockNotificaciones.crearParaUsuario.mockResolvedValue(undefined);

      await service.create(
        {
          fecha: '2026-07-01',
          hora: '10:00',
          id_mascota: 10,
          id_veterinario: 7,
        },
        clienteUser,
      );

      expect(mockNotificaciones.crearParaUsuario).toHaveBeenCalledWith(
        3,
        expect.any(String),
        expect.any(String),
        'nueva_cita',
        expect.any(Number),
        expect.any(Number),
        'cita',
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('lanza NotFoundException si la cita no existe', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cliente no puede ver una cita que no le pertenece', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_usuario: 99,
      });
      await expect(service.findOne(1, clienteUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('cliente puede ver su propia cita', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue(citaBase);
      const result = await service.findOne(1, clienteUser);
      expect(result).toBeDefined();
    });

    it('veterinario no puede ver cita asignada a otro vet', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 999,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });
      await expect(service.findOne(1, vetUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('veterinario no puede actualizar cita de otro vet', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 999,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });

      await expect(
        service.update(1, { estado: 'confirmada' }, vetUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('notifica al cliente cuando la cita se confirma', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 7,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });
      mockPrisma.citas.update.mockResolvedValue({
        ...citaBase,
        estado: 'confirmada',
      });
      mockNotificaciones.crearParaUsuario.mockResolvedValue(undefined);

      await service.update(1, { estado: 'confirmada' }, vetUser);

      expect(mockNotificaciones.crearParaUsuario).toHaveBeenCalledWith(
        2,
        'Actualización de tu cita',
        expect.any(String),
        'cita_actualizada',
        expect.any(Number),
        expect.any(Number),
        'cita',
      );
      expect(mockMail.sendAppointmentConfirmation).toHaveBeenCalledWith(
        'cliente@test.com',
        expect.objectContaining({ nombre: 'Cliente', mascota: 'Firulais' }),
      );
      expect(mockMail.sendAppointmentCancelled).not.toHaveBeenCalled();
      expect(mockMail.sendAppointmentRescheduled).not.toHaveBeenCalled();
    });

    it('envía correo de reprogramación cuando el estado cambia a reprogramada', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 7,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });
      mockPrisma.citas.update.mockResolvedValue({
        ...citaBase,
        estado: 'reprogramada',
      });

      await service.update(1, { estado: 'reprogramada' }, vetUser);

      expect(mockMail.sendAppointmentRescheduled).toHaveBeenCalledWith(
        'cliente@test.com',
        expect.objectContaining({ nombre: 'Cliente', mascota: 'Firulais' }),
      );
      expect(mockMail.sendAppointmentConfirmation).not.toHaveBeenCalled();
    });

    it('envía correo de reprogramación cuando solo cambia fecha/hora sin cambiar el estado', async () => {
      const nuevaFecha = new Date('2026-08-01');
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 7,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });
      mockPrisma.citas.update.mockResolvedValue({
        ...citaBase,
        fecha: nuevaFecha,
        hora: '15:00',
      });

      await service.update(1, { fecha: '2026-08-01', hora: '15:00' }, vetUser);

      expect(mockMail.sendAppointmentRescheduled).toHaveBeenCalledWith(
        'cliente@test.com',
        expect.objectContaining({ nombre: 'Cliente', mascota: 'Firulais' }),
      );
    });

    it('envía correo de cancelación cuando el estado cambia a cancelada', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue(citaBase);
      mockPrisma.citas.update.mockResolvedValue({
        ...citaBase,
        estado: 'cancelada',
      });

      await service.update(1, { estado: 'cancelada' }, clienteUser);

      expect(mockMail.sendAppointmentCancelled).toHaveBeenCalledWith(
        'cliente@test.com',
        expect.objectContaining({ nombre: 'Cliente', mascota: 'Firulais' }),
      );
    });

    it('envía correo de inasistencia cuando el estado cambia a no asistió', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 7,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });
      mockPrisma.citas.update.mockResolvedValue({
        ...citaBase,
        estado: 'no asistió',
      });

      await service.update(1, { estado: 'no asistió' }, vetUser);

      expect(mockMail.sendAppointmentNoShow).toHaveBeenCalledWith(
        'cliente@test.com',
        expect.objectContaining({ nombre: 'Cliente', mascota: 'Firulais' }),
      );
      expect(mockMail.sendAppointmentCancelled).not.toHaveBeenCalled();
    });

    it('no envía correo si no hay cambio de estado ni de fecha/hora', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_veterinario: 7,
      });
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 7,
      });
      mockPrisma.citas.update.mockResolvedValue({ ...citaBase });

      await service.update(1, { notas: 'Sin cambios relevantes' }, vetUser);

      expect(mockMail.sendAppointmentConfirmation).not.toHaveBeenCalled();
      expect(mockMail.sendAppointmentCancelled).not.toHaveBeenCalled();
      expect(mockMail.sendAppointmentRescheduled).not.toHaveBeenCalled();
    });

    it('cliente puede cancelar su propia cita', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue(citaBase);
      mockPrisma.citas.update.mockResolvedValue({
        ...citaBase,
        estado: 'cancelada',
      });

      const result = await service.update(
        1,
        { estado: 'cancelada' },
        clienteUser,
      );

      expect(result).toBeDefined();
      expect(mockPrisma.citas.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_cita: 1 },
          data: { estado: 'cancelada' },
        }),
      );
    });

    it('cliente no puede cancelar la cita de otro cliente', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue({
        ...citaBase,
        id_usuario: 999,
      });

      await expect(
        service.update(1, { estado: 'cancelada' }, clienteUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.citas.update).not.toHaveBeenCalled();
    });

    it('cliente no puede cambiar su cita a un estado distinto de cancelada', async () => {
      mockPrisma.citas.findUnique.mockResolvedValue(citaBase);

      await expect(
        service.update(1, { estado: 'confirmada' }, clienteUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.citas.update).not.toHaveBeenCalled();
    });
  });
});
