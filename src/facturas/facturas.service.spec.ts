import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FacturasService } from './facturas.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  facturas: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  propietarios: { findUnique: jest.fn() },
  mascotas: { findUnique: jest.fn() },
  productos: { count: jest.fn() },
  servicios: { count: jest.fn() },
  detalle_productos: { createMany: jest.fn(), deleteMany: jest.fn() },
  detalle_servicios: { createMany: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(),
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
const factura = {
  id_factura: 10,
  id_propietario: 7,
  id_clinica: 1,
  propietarios: { id_clinica: 1 },
  mascotas: { id_clinica: 1, id_propietario: 7 },
};

type CreateFacturaTx = {
  facturas: {
    create: jest.Mock<Promise<{ id_factura: number }>, [unknown]>;
    findUnique: jest.Mock<
      Promise<{ id_factura: number; total: number }>,
      [unknown]
    >;
  };
  detalle_productos: { createMany: jest.Mock };
  detalle_servicios: { createMany: jest.Mock };
};

describe('FacturasService', () => {
  let service: FacturasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacturasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FacturasService>(FacturasService);
    jest.clearAllMocks();
  });

  it('admin lista facturas por id_clinica directo', async () => {
    mockPrisma.facturas.findMany.mockResolvedValue([]);
    mockPrisma.facturas.count.mockResolvedValue(0);

    await service.findAll(adminUser, { page: 1, limit: 10 });

    expect(mockPrisma.facturas.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_clinica: 1 },
        take: 10,
        skip: 0,
      }),
    );
  });

  it('cliente solo lista sus propias facturas en su clínica', async () => {
    mockPrisma.propietarios.findUnique.mockResolvedValue({
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.facturas.findMany.mockResolvedValue([]);
    mockPrisma.facturas.count.mockResolvedValue(0);

    await service.findAll(clienteUser);

    expect(mockPrisma.facturas.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_clinica: 1, id_propietario: 7 } }),
    );
  });

  it('crea factura validando relaciones de la misma clínica y calcula total', async () => {
    mockPrisma.propietarios.findUnique.mockResolvedValue({
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.mascotas.findUnique.mockResolvedValue({
      id_mascota: 5,
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.productos.count.mockResolvedValue(1);
    mockPrisma.servicios.count.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: CreateFacturaTx) => Promise<unknown>) => {
        const tx: CreateFacturaTx = {
          facturas: {
            create: jest
              .fn<Promise<{ id_factura: number }>, [unknown]>()
              .mockResolvedValue({ id_factura: 10 }),
            findUnique: jest
              .fn<Promise<{ id_factura: number; total: number }>, [unknown]>()
              .mockResolvedValue({ id_factura: 10, total: 120000 }),
          },
          detalle_productos: { createMany: jest.fn() },
          detalle_servicios: { createMany: jest.fn() },
        };

        const result = await fn(tx);

        expect(tx.facturas.create).toHaveBeenCalledWith({
          data: {
            id_propietario: 7,
            id_mascota: 5,
            id_clinica: 1,
            total: 120000,
          },
        });
        expect(tx.detalle_productos.createMany).toHaveBeenCalled();
        expect(tx.detalle_servicios.createMany).toHaveBeenCalled();
        return result;
      },
    );

    await service.create(
      {
        id_propietario: 7,
        id_mascota: 5,
        productos: [{ id_producto: 1, cantidad: 2, precio_unitario: 25000 }],
        servicios: [{ id_servicio: 1, cantidad: 1, precio_unitario: 70000 }],
      },
      adminUser,
    );
  });

  it('rechaza factura con mascota de otra clínica', async () => {
    mockPrisma.propietarios.findUnique.mockResolvedValue({
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.mascotas.findUnique.mockResolvedValue({
      id_mascota: 5,
      id_propietario: 7,
      id_clinica: 2,
    });

    await expect(
      service.create({ id_propietario: 7, id_mascota: 5 }, adminUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rechaza factura sin propietario ni mascota', async () => {
    await expect(
      service.create(
        {
          productos: [{ id_producto: 1, cantidad: 1, precio_unitario: 10000 }],
        },
        adminUser,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza factura si mascota no pertenece al propietario indicado', async () => {
    mockPrisma.propietarios.findUnique.mockResolvedValue({
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.mascotas.findUnique.mockResolvedValue({
      id_mascota: 5,
      id_propietario: 99,
      id_clinica: 1,
    });

    await expect(
      service.create({ id_propietario: 7, id_mascota: 5 }, adminUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('actualiza factura accesible de la misma clínica', async () => {
    mockPrisma.facturas.findUnique.mockResolvedValue(factura);
    mockPrisma.facturas.update.mockResolvedValue({ ...factura, total: 90000 });

    await service.update(10, { total: 90000 }, adminUser);

    expect(mockPrisma.facturas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_factura: 10 },
        data: { total: 90000 },
      }),
    );
  });

  it('rechaza actualizar factura de otra clínica', async () => {
    mockPrisma.facturas.findUnique.mockResolvedValue({
      ...factura,
      id_clinica: 2,
      propietarios: { id_clinica: 2 },
      mascotas: { id_clinica: 2 },
    });

    await expect(
      service.update(10, { total: 90000 }, adminUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lanza NotFoundException si la factura no existe', async () => {
    mockPrisma.facturas.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99, adminUser)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('elimina detalles antes de eliminar factura', async () => {
    mockPrisma.facturas.findUnique.mockResolvedValue(factura);
    mockPrisma.$transaction.mockImplementation(async (ops: any[]) => {
      for (const op of ops) await op;
    });
    mockPrisma.detalle_productos.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.detalle_servicios.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.facturas.delete.mockResolvedValue({});

    await service.remove(10, adminUser);

    expect(mockPrisma.detalle_productos.deleteMany).toHaveBeenCalledWith({
      where: { id_factura: 10 },
    });
    expect(mockPrisma.facturas.delete).toHaveBeenCalledWith({
      where: { id_factura: 10 },
    });
  });
});
