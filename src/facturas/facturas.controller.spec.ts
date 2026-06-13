import { Test, TestingModule } from '@nestjs/testing';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';
import { ROLES } from '../common/constants/roles.constant';

const mockService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const adminUser = { sub: 1, role: ROLES.ADMIN, name: 'Admin', email: 'admin@test.com', clinicaId: 1 };

describe('FacturasController', () => {
  let controller: FacturasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturasController],
      providers: [{ provide: FacturasService, useValue: mockService }],
    }).compile();

    controller = module.get<FacturasController>(FacturasController);
    jest.clearAllMocks();
  });

  it('propaga CurrentUser y paginación al listado', () => {
    mockService.findAll.mockReturnValue([]);

    controller.findAll(adminUser, { page: 1, limit: 10 });

    expect(mockService.findAll).toHaveBeenCalledWith(adminUser, { page: 1, limit: 10 });
  });

  it('propaga CurrentUser en create', () => {
    const dto = { id_propietario: 7, servicios: [{ id_servicio: 1, cantidad: 1, precio_unitario: 50000 }] };
    mockService.create.mockReturnValue({ id_factura: 1 });

    controller.create(dto, adminUser);

    expect(mockService.create).toHaveBeenCalledWith(dto, adminUser);
  });

  it('propaga CurrentUser en update', () => {
    mockService.update.mockReturnValue({ id_factura: 1 });

    controller.update(1, { total: 50000 }, adminUser);

    expect(mockService.update).toHaveBeenCalledWith(1, { total: 50000 }, adminUser);
  });

  it('propaga CurrentUser en DELETE', () => {
    mockService.remove.mockReturnValue({ message: 'Factura eliminada.' });

    controller.remove(1, adminUser);

    expect(mockService.remove).toHaveBeenCalledWith(1, adminUser);
  });
});
