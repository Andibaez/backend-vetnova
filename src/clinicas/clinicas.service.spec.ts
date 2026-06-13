import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClinicasService } from './clinicas.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  clinicas: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  usuarios: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  roles: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const createDto = {
  nombre: 'Clínica Demo',
  slug: 'demo',
  direccion: 'Calle 1',
  telefono: '3001234567',
  email: 'demo@vetnova.com',
  adminNombre: 'Admin Demo',
  adminEmail: 'admin@demo.com',
  adminPassword: 'Admin123!',
};

describe('ClinicasService', () => {
  let service: ClinicasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClinicasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClinicasService>(ClinicasService);
    jest.clearAllMocks();
  });

  it('lista clínicas ordenadas por nombre', async () => {
    mockPrisma.clinicas.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(mockPrisma.clinicas.findMany).toHaveBeenCalledWith({ orderBy: { nombre: 'asc' } });
  });

  it('busca clínica por slug con datos públicos', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue({ id_clinica: 1, slug: 'demo' });

    await service.findBySlug('demo');

    expect(mockPrisma.clinicas.findUnique).toHaveBeenCalledWith({
      where: { slug: 'demo' },
      select: { id_clinica: true, nombre: true, slug: true, estado: true },
    });
  });

  it('lanza NotFoundException si no encuentra clínica por slug', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue(null);

    await expect(service.findBySlug('missing')).rejects.toThrow(NotFoundException);
  });

  it('rechaza crear clínica con slug duplicado', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue({ id_clinica: 1 });

    await expect(service.create(createDto)).rejects.toThrow(ConflictException);
  });

  it('rechaza crear clínica con email de admin duplicado', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue(null);
    mockPrisma.usuarios.findFirst.mockResolvedValue({ id_usuario: 1 });

    await expect(service.create(createDto)).rejects.toThrow(ConflictException);
  });

  it('crea clínica y administrador asignado a id_clinica', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue(null);
    mockPrisma.usuarios.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        clinicas: {
          create: jest.fn().mockResolvedValue({ id_clinica: 10, nombre: 'Clínica Demo', slug: 'demo' }),
        },
        roles: {
          findUnique: jest.fn().mockResolvedValue({ id_rol: 2, nombre: ROLES.ADMIN }),
          create: jest.fn(),
        },
        usuarios: {
          create: jest.fn().mockResolvedValue({ id_usuario: 20 }),
        },
      };

      const result = await fn(tx);

      expect(tx.clinicas.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ nombre: 'Clínica Demo', slug: 'demo' }),
      });
      expect(tx.usuarios.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'admin@demo.com',
          id_rol: 2,
          id_clinica: 10,
        }),
      });
      return result;
    });

    await expect(service.create(createDto)).resolves.toEqual({ id_clinica: 10, nombre: 'Clínica Demo', slug: 'demo' });
  });

  it('actualiza clínica existente', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue({ id_clinica: 1 });
    mockPrisma.clinicas.update.mockResolvedValue({ id_clinica: 1, nombre: 'Nueva' });

    await service.update(1, { nombre: 'Nueva' });

    expect(mockPrisma.clinicas.update).toHaveBeenCalledWith({ where: { id_clinica: 1 }, data: { nombre: 'Nueva' } });
  });

  it('lanza NotFoundException al actualizar clínica inexistente', async () => {
    mockPrisma.clinicas.findUnique.mockResolvedValue(null);

    await expect(service.update(99, { nombre: 'Nueva' })).rejects.toThrow(NotFoundException);
  });
});
