import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RecordatoriosService } from './recordatorios.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  recordatorios: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  mascotas: { findUnique: jest.fn() },
  propietarios: { findUnique: jest.fn() },
  veterinarios: { findUnique: jest.fn() },
  citas: { findFirst: jest.fn() },
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
const mascota = { id_mascota: 10, id_propietario: 7, id_clinica: 1 };

describe('RecordatoriosService', () => {
  let service: RecordatoriosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecordatoriosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RecordatoriosService>(RecordatoriosService);
    jest.clearAllMocks();
  });

  it('admin lista recordatorios por id_clinica de mascota', async () => {
    mockPrisma.recordatorios.findMany.mockResolvedValue([]);
    mockPrisma.recordatorios.count.mockResolvedValue(0);

    await service.findAll(adminUser, undefined, { page: 1, limit: 10 });

    expect(mockPrisma.recordatorios.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mascotas: { id_clinica: 1 } },
        take: 10,
        skip: 0,
      }),
    );
  });

  it('cliente lista solo recordatorios de sus mascotas', async () => {
    mockPrisma.propietarios.findUnique.mockResolvedValue({
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.recordatorios.findMany.mockResolvedValue([]);
    mockPrisma.recordatorios.count.mockResolvedValue(0);

    await service.findAll(clienteUser);

    expect(mockPrisma.recordatorios.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mascotas: { id_clinica: 1, id_propietario: 7 } },
      }),
    );
  });

  it('veterinario lista solo pacientes asignados en su clínica', async () => {
    mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 8 });
    mockPrisma.recordatorios.findMany.mockResolvedValue([]);
    mockPrisma.recordatorios.count.mockResolvedValue(0);

    await service.findAll(vetUser);

    expect(mockPrisma.recordatorios.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mascotas: {
            id_clinica: 1,
            citas: { some: { id_veterinario: 8, id_clinica: 1 } },
          },
        },
      }),
    );
  });

  it('crea recordatorio para mascota de la misma clínica', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.recordatorios.create.mockResolvedValue({ id_recordatorio: 1 });

    await service.create(
      { mensaje: 'Vacuna', fecha_recordatorio: '2026-07-01', id_mascota: 10 },
      adminUser,
    );

    expect(mockPrisma.recordatorios.create).toHaveBeenCalledWith({
      data: {
        mensaje: 'Vacuna',
        fecha_recordatorio: new Date('2026-07-01'),
        estado: 'pendiente',
        id_mascota: 10,
      },
      include: { mascotas: { select: { nombre: true } } },
    });
  });

  it('rechaza crear recordatorio para mascota de otra clínica', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue({
      ...mascota,
      id_clinica: 2,
    });

    await expect(
      service.create(
        { mensaje: 'Vacuna', fecha_recordatorio: '2026-07-01', id_mascota: 10 },
        adminUser,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('actualiza y revalida nueva mascota si cambia id_mascota', async () => {
    mockPrisma.recordatorios.findUnique.mockResolvedValue({
      id_recordatorio: 1,
      id_mascota: 10,
      mascotas: mascota,
    });
    mockPrisma.mascotas.findUnique.mockResolvedValue({
      id_mascota: 11,
      id_propietario: 7,
      id_clinica: 1,
    });
    mockPrisma.recordatorios.update.mockResolvedValue({ id_recordatorio: 1 });

    await service.update(1, { id_mascota: 11, estado: 'enviado' }, adminUser);

    expect(mockPrisma.mascotas.findUnique).toHaveBeenCalledWith({
      where: { id_mascota: 11 },
    });
    expect(mockPrisma.recordatorios.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id_recordatorio: 1 } }),
    );
  });

  it('lanza NotFoundException si el recordatorio no existe', async () => {
    mockPrisma.recordatorios.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99, adminUser)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('elimina recordatorio accesible', async () => {
    mockPrisma.recordatorios.findUnique.mockResolvedValue({
      id_recordatorio: 1,
      mascotas: mascota,
    });
    mockPrisma.recordatorios.delete.mockResolvedValue({});

    await service.remove(1, adminUser);

    expect(mockPrisma.recordatorios.delete).toHaveBeenCalledWith({
      where: { id_recordatorio: 1 },
    });
  });
});
