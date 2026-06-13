import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServiciosService } from './servicios.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  servicios: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  detalle_servicios: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
};

const adminUser = { sub: 1, role: ROLES.ADMIN, name: 'Admin', email: 'admin@test.com', clinicaId: 1 };

describe('ServiciosService', () => {
  let service: ServiciosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServiciosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ServiciosService>(ServiciosService);
    jest.clearAllMocks();
  });

  it('lista servicios filtrando por id_clinica', async () => {
    mockPrisma.servicios.findMany.mockResolvedValue([]);

    await service.findAll(adminUser);

    expect(mockPrisma.servicios.findMany).toHaveBeenCalledWith({
      where: { id_clinica: 1 },
      orderBy: { nombre: 'asc' },
    });
  });

  it('rechaza listado si el usuario no tiene clínica', async () => {
    expect(() => service.findAll({ ...adminUser, clinicaId: null })).toThrow(ForbiddenException);
  });

  it('lanza NotFoundException si el servicio no existe', async () => {
    mockPrisma.servicios.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99, adminUser)).rejects.toThrow(NotFoundException);
  });

  it('crea servicios con los datos recibidos', async () => {
    mockPrisma.servicios.create.mockResolvedValue({ id_servicio: 1 });

    await service.create({ nombre: 'Consulta', precio: 50000 }, adminUser);

    expect(mockPrisma.servicios.create).toHaveBeenCalledWith({
      data: { nombre: 'Consulta', precio: 50000, id_clinica: 1 },
    });
  });

  it('actualiza un servicio existente', async () => {
    mockPrisma.servicios.findUnique.mockResolvedValue({ id_servicio: 1, id_clinica: 1 });
    mockPrisma.servicios.update.mockResolvedValue({ id_servicio: 1 });

    await service.update(1, { nombre: 'Consulta general' }, adminUser);

    expect(mockPrisma.servicios.update).toHaveBeenCalledWith({
      where: { id_servicio: 1 },
      data: { nombre: 'Consulta general' },
    });
  });

  it('elimina detalles antes de eliminar el servicio', async () => {
    mockPrisma.servicios.findUnique.mockResolvedValue({ id_servicio: 1, id_clinica: 1 });
    mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
      for (const op of ops) await op;
    });
    mockPrisma.detalle_servicios.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.servicios.delete.mockResolvedValue({});

    await service.remove(1, adminUser);

    expect(mockPrisma.detalle_servicios.deleteMany).toHaveBeenCalledWith({ where: { id_servicio: 1 } });
    expect(mockPrisma.servicios.delete).toHaveBeenCalledWith({ where: { id_servicio: 1 } });
  });
});
