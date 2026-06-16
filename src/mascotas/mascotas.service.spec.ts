import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MascotasService } from './mascotas.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  mascotas: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  propietarios: { findUnique: jest.fn() },
  consultas: { deleteMany: jest.fn() },
  historias_clinicas: { deleteMany: jest.fn() },
  recordatorios: { deleteMany: jest.fn() },
  registro_vacunas: { deleteMany: jest.fn() },
  citas: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockNotificaciones = {
  crearParaAdmins: jest.fn(),
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
const userWithoutClinic = { ...adminUser, clinicaId: null };

describe('MascotasService', () => {
  let service: MascotasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MascotasService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificacionesService, useValue: mockNotificaciones },
      ],
    }).compile();

    service = module.get<MascotasService>(MascotasService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('admin crea mascota con id_clinica del usuario', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 5,
        id_clinica: 1,
      });
      mockPrisma.mascotas.create.mockResolvedValue({ id_mascota: 10 });

      await service.create({ nombre: 'Luna', id_propietario: 5 }, adminUser);

      expect(mockPrisma.mascotas.create).toHaveBeenCalledWith({
        data: { nombre: 'Luna', id_propietario: 5, id_clinica: 1 },
      });
    });

    it('rechaza propietario inexistente', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ nombre: 'Luna', id_propietario: 99 }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza propietario de otra clínica', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 5,
        id_clinica: 2,
      });

      await expect(
        service.create({ nombre: 'Luna', id_propietario: 5 }, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cliente solo crea mascotas para su propio propietario', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 7,
        id_clinica: 1,
      });
      mockPrisma.mascotas.create.mockResolvedValue({ id_mascota: 10 });

      await service.create({ nombre: 'Luna' }, clienteUser);

      expect(mockPrisma.mascotas.create).toHaveBeenCalledWith({
        data: { nombre: 'Luna', id_propietario: 7, id_clinica: 1 },
      });
    });

    it('requiere clínica asociada', async () => {
      await expect(
        service.create({ nombre: 'Luna' }, userWithoutClinic),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('admin lista mascotas filtrando por id_clinica', async () => {
      mockPrisma.mascotas.findMany.mockResolvedValue([]);
      mockPrisma.mascotas.count.mockResolvedValue(0);

      await service.findAll(adminUser, undefined, { page: 1, limit: 10 });

      expect(mockPrisma.mascotas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_clinica: 1 },
          take: 10,
          skip: 0,
        }),
      );
      expect(mockPrisma.mascotas.count).toHaveBeenCalledWith({
        where: { id_clinica: 1 },
      });
    });

    it('cliente lista solo mascotas de su propietario y clínica', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 7,
        id_clinica: 1,
      });
      mockPrisma.mascotas.findMany.mockResolvedValue([]);
      mockPrisma.mascotas.count.mockResolvedValue(0);

      await service.findAll(clienteUser);

      expect(mockPrisma.mascotas.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_propietario: 7, id_clinica: 1 },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(null);

      await expect(service.findOne(99, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cliente no puede ver mascota de otro propietario', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue({
        id_mascota: 10,
        id_propietario: 99,
        id_clinica: 1,
      });
      mockPrisma.propietarios.findUnique.mockResolvedValue({
        id_propietario: 7,
        id_clinica: 1,
      });

      await expect(service.findOne(10, clienteUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateMascota', () => {
    it('cliente no puede actualizar mascotas directamente', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue({
        id_mascota: 10,
        id_clinica: 1,
      });

      await expect(
        service.updateMascota(10, { nombre: 'Luna' }, clienteUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('veterinario actualiza mascota existente', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue({
        id_mascota: 10,
        id_clinica: 1,
      });
      mockPrisma.mascotas.update.mockResolvedValue({
        id_mascota: 10,
        nombre: 'Luna',
      });

      await service.updateMascota(10, { nombre: 'Luna' }, vetUser);

      expect(mockPrisma.mascotas.update).toHaveBeenCalledWith({
        where: { id_mascota: 10 },
        data: { nombre: 'Luna' },
      });
    });
  });

  describe('deleteMascota', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(null);

      await expect(service.deleteMascota(99, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('elimina dependencias antes de borrar mascota', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue({
        id_mascota: 10,
        id_clinica: 1,
      });
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        for (const op of ops) await op;
      });
      mockPrisma.consultas.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.historias_clinicas.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.recordatorios.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.registro_vacunas.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.citas.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.mascotas.delete.mockResolvedValue({});

      await service.deleteMascota(10, adminUser);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.mascotas.delete).toHaveBeenCalledWith({
        where: { id_mascota: 10 },
      });
    });
  });
});
