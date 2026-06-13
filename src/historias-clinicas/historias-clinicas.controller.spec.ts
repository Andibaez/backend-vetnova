import { Test, TestingModule } from '@nestjs/testing';
import { HistoriasClinicasController } from './historias-clinicas.controller';
import { HistoriasClinicasService } from './historias-clinicas.service';
import { ROLES } from '../common/constants/roles.constant';

const mockService = {
  findByMascota: jest.fn(),
  createConsulta: jest.fn(),
  updateConsulta: jest.fn(),
  removeConsulta: jest.fn(),
};

const vetUser = { sub: 3, role: ROLES.VETERINARIO, name: 'Vet', email: 'vet@test.com', clinicaId: 1 };

describe('HistoriasClinicasController', () => {
  let controller: HistoriasClinicasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoriasClinicasController],
      providers: [{ provide: HistoriasClinicasService, useValue: mockService }],
    }).compile();

    controller = module.get<HistoriasClinicasController>(HistoriasClinicasController);
    jest.clearAllMocks();
  });

  it('propaga CurrentUser al consultar historia por mascota', () => {
    mockService.findByMascota.mockReturnValue({ consultas: [] });

    controller.findByMascota(10, vetUser);

    expect(mockService.findByMascota).toHaveBeenCalledWith(10, vetUser);
  });

  it('propaga CurrentUser en create de consulta', () => {
    const dto = { id_mascota: 10, motivo: 'Control' };
    mockService.createConsulta.mockReturnValue({ id_consulta: 1 });

    controller.createConsulta(dto, vetUser);

    expect(mockService.createConsulta).toHaveBeenCalledWith(dto, vetUser);
  });

  it('propaga CurrentUser en update de consulta', () => {
    mockService.updateConsulta.mockReturnValue({ id_consulta: 1 });

    controller.updateConsulta(1, { diagnostico: 'Ok' }, vetUser);

    expect(mockService.updateConsulta).toHaveBeenCalledWith(1, { diagnostico: 'Ok' }, vetUser);
  });

  it('propaga CurrentUser en DELETE de consulta', () => {
    mockService.removeConsulta.mockReturnValue({ message: 'Consulta eliminada.' });

    controller.removeConsulta(1, vetUser);

    expect(mockService.removeConsulta).toHaveBeenCalledWith(1, vetUser);
  });
});
