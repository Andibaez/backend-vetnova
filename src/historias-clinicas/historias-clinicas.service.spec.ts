import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HistoriasClinicasService } from './historias-clinicas.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES } from '../common/constants/roles.constant';

interface AuditoriaCreateArgs {
  data: {
    id_consulta: number;
    id_usuario: number;
    accion: string;
    motivo: string | null;
    datos_anteriores: unknown;
  };
}

interface ConsultaUpdateArgs {
  where: { id_consulta: number };
  data: { eliminada_at: Date };
}

interface ConsultaCreateArgs {
  data: { archivada_por_migracion: boolean };
}

const mockPrisma = {
  mascotas: { findUnique: jest.fn() },
  historias_clinicas: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  consultas: {
    findUnique: jest.fn(),
    create: jest.fn<unknown, [ConsultaCreateArgs]>(),
    update: jest.fn<unknown, [ConsultaUpdateArgs]>(),
    delete: jest.fn(),
  },
  auditoria_consultas: {
    create: jest.fn<unknown, [AuditoriaCreateArgs]>(),
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
          where: { eliminada_at: null, archivada_por_migracion: false },
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

  describe('acceso legado tras migrar de clínica', () => {
    // La mascota ya pertenece a otra clínica (clinicaId 2), distinta de la
    // del usuario que pregunta (clinicaId 1) — simula a la clínica anterior
    // intentando atender una cita que ya tenía agendada.
    const mascotaMigrada = { ...mascota, id_clinica: 2 };

    it('admin de la clínica anterior accede si tiene una cita vinculada', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascotaMigrada);
      mockPrisma.historias_clinicas.findUnique.mockResolvedValue({
        id_historia: 5,
        consultas: [],
      });
      mockPrisma.citas.findFirst.mockResolvedValue({ id_cita: 99 });

      await expect(service.findByMascota(10, adminUser)).resolves.toBeDefined();
      expect(mockPrisma.citas.findFirst).toHaveBeenCalledWith({
        where: { id_mascota: 10, id_clinica: 1 },
        select: { id_cita: true },
      });
    });

    it('admin de la clínica anterior es rechazado sin cita vinculada', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascotaMigrada);
      mockPrisma.citas.findFirst.mockResolvedValue(null);

      await expect(service.findByMascota(10, adminUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('cliente nunca accede por la vía legada, aunque haya una cita', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascotaMigrada);
      mockPrisma.citas.findFirst.mockResolvedValue({ id_cita: 99 });

      await expect(service.findByMascota(10, clienteUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('veterinario de la clínica anterior necesita estar asignado a la cita', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascotaMigrada);
      mockPrisma.veterinarios.findUnique.mockResolvedValue({
        id_veterinario: 8,
      });
      // Primera llamada: hay una cita vinculada a la clínica (acceso legado válido).
      // Segunda llamada: ninguna cita asignada a este veterinario en particular.
      mockPrisma.citas.findFirst
        .mockResolvedValueOnce({ id_cita: 99 })
        .mockResolvedValueOnce(null);

      await expect(service.findByMascota(10, vetUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('crea la consulta archivada de entrada cuando se escribe desde la clínica anterior', async () => {
      mockPrisma.mascotas.findUnique.mockResolvedValue(mascotaMigrada);
      mockPrisma.citas.findFirst.mockResolvedValue({ id_cita: 99 });
      mockPrisma.historias_clinicas.findUnique.mockResolvedValue({
        id_historia: 5,
      });
      (mockPrisma.consultas.create as jest.Mock).mockResolvedValue({
        id_consulta: 12,
      });

      await service.createConsulta(
        { id_mascota: 10, motivo: 'Control' },
        adminUser,
      );

      const createArgs = mockPrisma.consultas.create.mock.calls[0][0];
      expect(createArgs.data.archivada_por_migracion).toBe(true);
    });
  });

  it('crea historia si no existe antes de crear consulta', async () => {
    mockPrisma.mascotas.findUnique.mockResolvedValue(mascota);
    mockPrisma.historias_clinicas.findUnique.mockResolvedValue(null);
    mockPrisma.historias_clinicas.create.mockResolvedValue({ id_historia: 5 });
    (mockPrisma.consultas.create as jest.Mock).mockResolvedValue({
      id_consulta: 11,
    });

    await service.createConsulta(
      { id_mascota: 10, motivo: 'Control' },
      adminUser,
    );

    expect(mockPrisma.historias_clinicas.create).toHaveBeenCalledWith({
      data: { id_mascota: 10 },
    });
    expect(mockPrisma.consultas.create).toHaveBeenCalledWith({
      data: {
        archivada_por_migracion: false,
        diagnostico: undefined,
        frecuencia_cardiaca: undefined,
        id_historia: 5,
        id_usuario: 1,
        motivo: 'Control',
        peso: undefined,
        recomendaciones: undefined,
        temperatura: undefined,
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

    const updateCall = mockPrisma.consultas.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id_consulta: 11 });
    expect(updateCall.data.eliminada_at).toBeInstanceOf(Date);
    const auditCall = mockPrisma.auditoria_consultas.create.mock.calls[0][0];
    expect(auditCall.data).toMatchObject({
      id_consulta: 11,
      id_usuario: 1,
      accion: 'eliminacion',
      motivo: null,
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

    const auditCall = mockPrisma.auditoria_consultas.create.mock.calls[0][0];
    expect(auditCall.data).toMatchObject({
      accion: 'eliminacion',
      motivo: 'Error de registro detectado en auditoría',
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
