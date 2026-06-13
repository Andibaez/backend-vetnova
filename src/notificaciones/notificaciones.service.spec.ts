import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  notificaciones: {
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  usuarios: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

const clienteUser = { sub: 2, role: ROLES.CLIENTE, name: 'Cliente', email: 'cliente@test.com', clinicaId: 1 };

describe('NotificacionesService', () => {
  let service: NotificacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificacionesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificacionesService>(NotificacionesService);
    jest.clearAllMocks();
  });

  it('lista notificaciones del usuario filtrando destino por id_clinica', async () => {
    mockPrisma.notificaciones.findMany.mockResolvedValue([]);

    await service.findAll(clienteUser, true);

    expect(mockPrisma.notificaciones.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_usuario_destino: 2, destino: { id_clinica: 1 }, leida: false },
      }),
    );
  });

  it('cuenta solo no leídas del usuario y clínica', async () => {
    mockPrisma.notificaciones.count.mockResolvedValue(3);

    await expect(service.count(clienteUser)).resolves.toEqual({ count: 3 });
    expect(mockPrisma.notificaciones.count).toHaveBeenCalledWith({
      where: { id_usuario_destino: 2, leida: false, destino: { id_clinica: 1 } },
    });
  });

  it('marca leída solo si pertenece al usuario y clínica', async () => {
    mockPrisma.notificaciones.updateMany.mockResolvedValue({ count: 1 });

    await service.marcarLeida(9, clienteUser);

    expect(mockPrisma.notificaciones.updateMany).toHaveBeenCalledWith({
      where: { id_notificacion: 9, id_usuario_destino: 2, destino: { id_clinica: 1 } },
      data: { leida: true },
    });
  });

  it('elimina notificación propia de la misma clínica', async () => {
    mockPrisma.notificaciones.findUnique.mockResolvedValue({
      id_notificacion: 9,
      id_usuario_destino: 2,
      destino: { id_usuario: 2, id_clinica: 1 },
    });
    mockPrisma.notificaciones.delete.mockResolvedValue({});

    await service.remove(9, clienteUser);

    expect(mockPrisma.notificaciones.delete).toHaveBeenCalledWith({ where: { id_notificacion: 9 } });
  });

  it('rechaza eliminar notificación ajena o de otra clínica', async () => {
    mockPrisma.notificaciones.findUnique.mockResolvedValue({
      id_notificacion: 9,
      id_usuario_destino: 99,
      destino: { id_usuario: 99, id_clinica: 1 },
    });

    await expect(service.remove(9, clienteUser)).rejects.toThrow(ForbiddenException);
  });

  it('lanza NotFoundException al eliminar notificación inexistente', async () => {
    mockPrisma.notificaciones.findUnique.mockResolvedValue(null);

    await expect(service.remove(99, clienteUser)).rejects.toThrow(NotFoundException);
  });

  it('crea notificación si origen y destino son de la misma clínica', async () => {
    mockPrisma.usuarios.findUnique
      .mockResolvedValueOnce({ id_clinica: 1 })
      .mockResolvedValueOnce({ id_clinica: 1 });
    mockPrisma.notificaciones.create.mockResolvedValue({});

    await service.crearParaUsuario(2, 'Título', 'Mensaje', 'general', 1);

    expect(mockPrisma.notificaciones.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        titulo: 'Título',
        mensaje: 'Mensaje',
        tipo: 'general',
        id_usuario_destino: 2,
        id_usuario_origen: 1,
      }),
    });
  });

  it('rechaza crear notificación entre clínicas distintas', async () => {
    mockPrisma.usuarios.findUnique
      .mockResolvedValueOnce({ id_clinica: 1 })
      .mockResolvedValueOnce({ id_clinica: 2 });

    await expect(service.crearParaUsuario(2, 'Título', 'Mensaje', 'general', 1)).rejects.toThrow(ForbiddenException);
  });

  it('crea notificaciones para administradores de la clínica indicada', async () => {
    mockPrisma.usuarios.findMany.mockResolvedValue([{ id_usuario: 1 }, { id_usuario: 3 }]);
    mockPrisma.notificaciones.createMany.mockResolvedValue({ count: 2 });

    await service.crearParaAdmins('Título', 'Mensaje', 'general', 1, 2);

    expect(mockPrisma.usuarios.findMany).toHaveBeenCalledWith({
      where: { roles: { nombre: ROLES.ADMIN }, id_clinica: 1 },
      select: { id_usuario: true },
    });
    expect(mockPrisma.notificaciones.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ id_usuario_destino: 1, id_usuario_origen: 2 }),
        expect.objectContaining({ id_usuario_destino: 3, id_usuario_origen: 2 }),
      ],
    });
  });
});
