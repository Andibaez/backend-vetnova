import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  usuarios: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  roles: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  recepcionistas: { deleteMany: jest.fn() },
  veterinarios: { findUnique: jest.fn(), deleteMany: jest.fn() },
  citas: { updateMany: jest.fn() },
  consultas: { updateMany: jest.fn() },
  propietarios: { updateMany: jest.fn() },
  $transaction: jest.fn(),
};

const mockNotificaciones = {
  crearParaUsuario: jest.fn(),
};

const adminUser = { sub: 1, role: ROLES.ADMIN, name: 'Admin', email: 'admin@test.com', clinicaId: null };
const clienteUser = { sub: 2, role: ROLES.CLIENTE, name: 'Cliente', email: 'cliente@test.com', clinicaId: null };
const vetUser = { sub: 3, role: ROLES.VETERINARIO, name: 'Vet', email: 'vet@test.com', clinicaId: null };

describe('UsuariosService', () => {
  let service: UsuariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificacionesService, useValue: mockNotificaciones },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
    jest.clearAllMocks();
  });

  // ── update ───────────────────────────────────────────────────

  describe('update', () => {
    const existingUser = { id_usuario: 2, email: 'a@b.com', password: 'hashed', nombre: 'Test', id_clinica: null };

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { nombre: 'Nuevo' }, adminUser)).rejects.toThrow(NotFoundException);
    });

    it('cliente no puede modificar el perfil de otro usuario', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({ ...existingUser, id_usuario: 99 });
      await expect(
        service.update(99, { nombre: 'Hack' }, clienteUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cliente no puede cambiar su propio rol', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({ ...existingUser, id_usuario: 2 });
      await expect(
        service.update(2, { rol: ROLES.ADMIN }, clienteUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('veterinario no puede cambiar su propio rol', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({ ...existingUser, id_usuario: 3 });
      await expect(
        service.update(3, { rol: ROLES.ADMIN }, vetUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('admin puede cambiar el rol de cualquier usuario', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(existingUser);
      mockPrisma.roles.findUnique.mockResolvedValue({ id_rol: 1, nombre: ROLES.ADMIN });
      mockPrisma.usuarios.update.mockResolvedValue({
        ...existingUser, roles: { nombre: ROLES.ADMIN },
      });

      await service.update(2, { rol: ROLES.ADMIN }, adminUser);

      expect(mockPrisma.usuarios.update).toHaveBeenCalled();
    });
  });

  // ── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('lanza NotFoundException si el usuario no existe', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue(null);
      await expect(service.remove(99, adminUser)).rejects.toThrow(NotFoundException);
    });

    it('ejecuta transacción con desvinculación de registros relacionados', async () => {
      mockPrisma.usuarios.findUnique.mockResolvedValue({ id_usuario: 1, id_clinica: null });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          veterinarios: { findUnique: jest.fn().mockResolvedValue(null), deleteMany: jest.fn() },
          recepcionistas: { deleteMany: jest.fn() },
          citas: { updateMany: jest.fn() },
          consultas: { updateMany: jest.fn() },
          propietarios: { updateMany: jest.fn() },
          usuarios: { delete: jest.fn() },
        };
        await fn(tx);
        expect(tx.citas.updateMany).toHaveBeenCalled();
        expect(tx.usuarios.delete).toHaveBeenCalledWith({ where: { id_usuario: 1 } });
      });

      await service.remove(1, adminUser);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
