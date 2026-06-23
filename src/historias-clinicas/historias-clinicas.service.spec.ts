import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  auditoria_consultas: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  propietarios: { findUnique: jest.fn() },
  veterinarios: { findUnique: jest.fn() },
  citas: { findFirst: jest.fn() },
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
const vetUser = {
  sub: 3,
  role: ROLES.VETERINARIO,
  name: 'Vet',
  email: 'vet@test.com',
  clinicaId: 1,
};
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
    mockPrisma.$transaction.mockImplementation((cb: (tx: any) => unknown) =>
      cb(mockPrisma),
    );
  });

  it('admin obtiene historia de mascota de su clínica', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.historias_clinicas.findUnique.mockResolvedValue({
      id_historia: 5,
      consultas: [],
    });

    await service.findByMascota(10, adminUser);

    expect(mockPrisma.historias_clinicas.findUnique).toHaveBeenCalledWith({
      where: { id_mascota: 10 },
      include: {
        consultas: {
          where: { eliminada_at: null },
          include: { usuarios: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
        },
      },
    });
  });

  it('rechaza historia de mascota de otra clínica', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue({
      ...mascota,
      id_clinica: 2,
    });

    await expect(service.findByMascota(10, adminUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('cliente solo accede a historia de su propia mascota', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.propietarios.findUnique.mockResolvedValue({
      id_propietario: 99,
      id_clinica: 1,
    });

    await expect(service.findByMascota(10, clienteUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('veterinario requiere cita asignada para acceder', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 8 });
    mockPrisma.citas.findFirst.mockResolvedValue(null);

    await expect(service.findByMascota(10, vetUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('crea historia si no existe antes de crear consulta', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.historias_clinicas.findUnique.mockResolvedValue(null);
    mockPrisma.historias_clinicas.create.mockResolvedValue({ id_historia: 5 });
    mockPrisma.consultas.create.mockResolvedValue({ id_consulta: 11 });

    await service.createConsulta(
      { id_mascota: 10, motivo: 'Control' },
      adminUser,
    );

    expect(mockPrisma.historias_clinicas.create).toHaveBeenCalledWith({
      data: { id_mascota: 10 },
    });
    expect(mockPrisma.consultas.create).toHaveBeenCalledWith({
      data: {
        diagnostico: undefined,
        id_historia: 5,
        id_usuario: 1,
        motivo: 'Control',
        tratamiento: undefined,
      },
      include: { usuarios: { select: { nombre: true } } },
    });
  });

  it('veterinario no actualiza consulta registrada por otro usuario', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 99,
      historias_clinicas: { mascotas: mascota },
    });
    mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 8 });
    mockPrisma.citas.findFirst.mockResolvedValue({ id_cita: 1 });

    await expect(
      service.updateConsulta(11, { diagnostico: 'Ok' }, vetUser),
    ).rejects.toThrow(ForbiddenException);
  });

  it('elimina (soft-delete) consulta propia sin requerir motivo', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 1,
      eliminada_at: null,
      motivo: 'Control',
      diagnostico: null,
      tratamiento: null,
      peso: null,
      temperatura: null,
      frecuencia_cardiaca: null,
      recomendaciones: null,
      historias_clinicas: { mascotas: mascota },
    });
    mockPrisma.consultas.update.mockResolvedValue({});

    await service.removeConsulta(11, {}, adminUser);

    expect(mockPrisma.consultas.update).toHaveBeenCalledWith({
      where: { id_consulta: 11 },
      data: { eliminada_at: expect.any(Date) },
    });
    expect(mockPrisma.auditoria_consultas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_consulta: 11,
        id_usuario: 1,
        accion: 'eliminacion',
        motivo: null,
      }),
    });
  });

  it('admin requiere motivoAuditoria para eliminar consulta de otro autor', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 99,
      eliminada_at: null,
      historias_clinicas: { mascotas: mascota },
    });

    await expect(service.removeConsulta(11, {}, adminUser)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('admin elimina consulta de otro autor cuando provee motivoAuditoria', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 99,
      eliminada_at: null,
      motivo: 'Control',
      diagnostico: null,
      tratamiento: null,
      peso: null,
      temperatura: null,
      frecuencia_cardiaca: null,
      recomendaciones: null,
      historias_clinicas: { mascotas: mascota },
    });
    mockPrisma.consultas.update.mockResolvedValue({});

    await service.removeConsulta(
      11,
      { motivoAuditoria: 'Error de registro detectado en auditoría' },
      adminUser,
    );

    expect(mockPrisma.auditoria_consultas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'eliminacion',
        motivo: 'Error de registro detectado en auditoría',
      }),
    });
  });

  it('admin requiere motivoAuditoria para editar consulta de otro autor', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 99,
      eliminada_at: null,
      historias_clinicas: { mascotas: mascota },
    });

    await expect(
      service.updateConsulta(11, { diagnostico: 'Ok' }, adminUser),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza NotFoundException si no existe consulta', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue(null);

    await expect(service.removeConsulta(99, {}, adminUser)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lanza NotFoundException si la consulta ya fue eliminada', async () => {
    mockPrisma.consultas.findUnique.mockResolvedValue({
      id_consulta: 11,
      id_usuario: 1,
      eliminada_at: new Date(),
      historias_clinicas: { mascotas: mascota },
    });

    await expect(service.removeConsulta(11, {}, adminUser)).rejects.toThrow(
      NotFoundException,
    );
  });
});
