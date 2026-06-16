import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { VeterinariosService } from './veterinarios.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  veterinarios: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('VeterinariosService', () => {
  let service: VeterinariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VeterinariosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<VeterinariosService>(VeterinariosService);
    jest.clearAllMocks();
  });

  it('obtiene el perfil del veterinario autenticado', async () => {
    mockPrisma.veterinarios.findUnique.mockResolvedValue({
      especialidad: 'Cirugía',
      licencia: 'LIC-123',
      telefono: '3001234567',
      horario_atencion: 'L-V 8-5',
    });

    await expect(service.obtenerPerfil(3)).resolves.toEqual({
      especialidad: 'Cirugía',
      registroProfesional: 'LIC-123',
      telefono: '3001234567',
      horarioAtencion: 'L-V 8-5',
    });
    expect(mockPrisma.veterinarios.findUnique).toHaveBeenCalledWith({
      where: { id_usuario: 3 },
    });
  });

  it('lanza NotFoundException si el veterinario no tiene perfil', async () => {
    mockPrisma.veterinarios.findUnique.mockResolvedValue(null);

    await expect(service.obtenerPerfil(99)).rejects.toThrow(NotFoundException);
  });

  it('actualiza solo el perfil del usuario veterinario autenticado', async () => {
    mockPrisma.veterinarios.findUnique.mockResolvedValue({ id_veterinario: 7 });
    mockPrisma.veterinarios.update.mockResolvedValue({
      especialidad: 'Dermatología',
      licencia: 'LIC-999',
      telefono: '3007654321',
      horario_atencion: 'S 8-12',
    });

    const result = await service.actualizarPerfil(3, {
      especialidad: 'Dermatología',
      registroProfesional: 'LIC-999',
      telefono: '3007654321',
      horarioAtencion: 'S 8-12',
    });

    expect(mockPrisma.veterinarios.update).toHaveBeenCalledWith({
      where: { id_usuario: 3 },
      data: {
        especialidad: 'Dermatología',
        licencia: 'LIC-999',
        telefono: '3007654321',
        horario_atencion: 'S 8-12',
      },
    });
    expect(result.registroProfesional).toBe('LIC-999');
  });
});
