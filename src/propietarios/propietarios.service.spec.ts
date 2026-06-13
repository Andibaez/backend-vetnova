import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PropietariosService } from './propietarios.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  propietarios: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  veterinarios: { findUnique: jest.fn() },
  facturas: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockNotificaciones = {
  crearParaUsuario: jest.fn(),
};

const adminUser = { sub: 1, role: ROLES.ADMIN, name: 'Admin', email: 'admin@test.com', clinicaId: 1 };
const clienteUser = { sub: 2, role: ROLES.CLIENTE, name: 'Cliente', email: 'cliente@test.com', clinicaId: 1 };
const vetUser = { sub: 3, role: ROLES.VETERINARIO, name: 'Vet', email: 'vet@test.com', clinicaId: 1 };

describe('PropietariosService', () => {
  let service: PropietariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropietariosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificacionesService, useValue: mockNotificaciones },
      ],
    }).compile();

    service = module.get<PropietariosService>(PropietariosService);
    jest.clearAllMocks();
  });

  // ── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('cliente solo ve su propio propietario', async () => {
      mockPrisma.propietarios.findMany.mockResolvedValue([{ id_propietario: 1 }]);

      await service.findAll(clienteUser);

      expect(mockPrisma.propietarios.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_usuario: clienteUser.sub, id_clinica: 1 } }),
      );
    });

    it('veterinario solo ve propietarios de sus pacientes', async () => {
      mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 7 });
      mockPrisma.propietarios.findMany.mockResolvedValue([]);

      await service.findAll(vetUser);

      expect(mockPrisma.propietarios.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            mascotas: { some: { citas: { some: { id_veterinario: 7 } } } },
            id_clinica: 1,
          },
        }),
      );
    });

    it('veterinario sin perfil retorna array vacío', async () => {
      mockPrisma.veterinarios.findUnique.mockResolvedValue(null);

      const result = await service.findAll(vetUser);

      expect(result).toEqual([]);
      expect(mockPrisma.propietarios.findMany).not.toHaveBeenCalled();
    });

    it('admin sin filtro ve todos los propietarios', async () => {
      mockPrisma.propietarios.findMany.mockResolvedValue([]);

      await service.findAll(adminUser);

      expect(mockPrisma.propietarios.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_clinica: 1 } }),
      );
    });

    it('admin con filtro id_usuario filtra correctamente', async () => {
      mockPrisma.propietarios.findMany.mockResolvedValue([]);

      await service.findAll(adminUser, 5);

      expect(mockPrisma.propietarios.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_usuario: 5, id_clinica: 1 } }),
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99, adminUser)).rejects.toThrow(NotFoundException);
    });

    it('cliente no puede ver propietario de otro usuario', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({ id_propietario: 1, id_usuario: 99, id_clinica: 1 });
      await expect(service.findOne(1, clienteUser)).rejects.toThrow(ForbiddenException);
    });

    it('cliente puede ver su propio propietario', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({ id_propietario: 1, id_usuario: 2, id_clinica: 1 });
      const result = await service.findOne(1, clienteUser);
      expect(result).toBeDefined();
    });
  });

  // ── deletePropietario ────────────────────────────────────────

  describe('deletePropietario', () => {
    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue(null);
      await expect(service.deletePropietario(99, adminUser)).rejects.toThrow(NotFoundException);
    });

    it('desvincula facturas antes de eliminar', async () => {
      mockPrisma.propietarios.findUnique.mockResolvedValue({ id_propietario: 1, id_clinica: 1 });
      mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
        for (const op of ops) await op;
      });
      mockPrisma.facturas.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.propietarios.delete.mockResolvedValue({});

      await service.deletePropietario(1, adminUser);

      expect(mockPrisma.facturas.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_propietario: 1 } }),
      );
    });
  });
});
