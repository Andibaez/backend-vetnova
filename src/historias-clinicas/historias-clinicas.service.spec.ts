import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HistoriasClinicasService } from './historias-clinicas.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

const mockPrisma = {
  mascotas: { findUnique: jest.fn() },
  historias_clinicas: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  consultas: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  propietarios: { findUnique: jest.fn() },
  veterinarios: { findUnique: jest.fn() },
  citas: { findFirst: jest.fn() },
};

const adminUser = { sub: 1, role: ROLES.ADMIN, name: 'Admin', email: 'admin@test.com', clinicaId: 1 };
const clienteUser = { sub: 2, role: ROLES.CLIENTE, name: 'Cliente', email: 'cliente@test.com', clinicaId: 1 };
const vetUser = { sub: 3, role: ROLES.VETERINARIO, name: 'Vet', email: 'vet@test.com', clinicaId: 1 };
const mascota = { id_mascota: 10, id_propietario: 7, id_clinica: 1 };

describe('HistoriasClinicasService', () => {
  let service: HistoriasClinicasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoriasClinicasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HistoriasClinicasService>(HistoriasClinicasService);
    jest.clearAllMocks();
  });

  it('admin obtiene historia de mascota de su clínica', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.historias_clinicas.findUnique.mockResolvedValue({ id_historia: 5, consultas: [] });

    await service.findByMascota(10, adminUser);

    expect(mockPrisma.historias_clinicas.findUnique).toHaveBeenCalledWith({
      where: { id_mascota: 10 },
      include: {
        consultas: {
          include: { usuarios: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
        },
      },
    });
  });

  it('rechaza historia de mascota de otra clínica', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue({ ...mascota, id_clinica: 2 });

    await expect(service.findByMascota(10, adminUser)).rejects.toThrow(ForbiddenException);
  });

  it('cliente solo accede a historia de su propia mascota', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.propietarios.findUnique.mockResolvedValue({ id_propietario: 99, id_clinica: 1 });

    await expect(service.findByMascota(10, clienteUser)).rejects.toThrow(ForbiddenException);
  });

  it('veterinario requiere cita asignada para acceder', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 8 });
    mockPrisma.citas.findFirst.mockResolvedValue(null);

    await expect(service.findByMascota(10, vetUser)).rejects.toThrow(ForbiddenException);
  });

  it('crea historia si no existe antes de crear consulta', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.historias_clinicas.findUnique.mockResolvedValue(null);
    mockPrisma.historias_clinicas.create.mockResolvedValue({ id_historia: 5 });
    mockPrisma.consultas.create.mockResolvedValue({ id_consulta: 11 });

    await service.createConsulta({ id_mascota: 10, motivo: 'Control' }, adminUser);

    expect(mockPrisma.historias_clinicas.create).toHaveBeenCalledWith({ data: { id_mascota: 10 } });
    expect(mockPrisma.consultas.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id_historia: 5, id_usuario: 1, motivo: 'Control' }),
      }),
    );
  });

  it('veterinario no actualiza consulta registrada por otro usuario', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 99,
      historias_clinicas: { mascotas: mascota },
    });
    mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 8 });
    mockPrisma.citas.findFirst.mockResolvedValue({ id_cita: 1 });

    await expect(service.updateConsulta(11, { diagnostico: 'Ok' }, vetUser)).rejects.toThrow(ForbiddenException);
  });

  it('elimina consulta accesible', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 1,
      historias_clinicas: { mascotas: mascota },
    });
    mockPrisma.consultas.delete.mockResolvedValue({});

    await service.removeConsulta(11, adminUser);

    expect(mockPrisma.consultas.delete).toHaveBeenCalledWith({ where: { id_consulta: 11 } });
  });

  it('lanza NotFoundException si no existe consulta', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue(null);

    await expect(service.removeConsulta(99, adminUser)).rejects.toThrow(NotFoundException);
  });
});
