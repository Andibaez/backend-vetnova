import { Test, TestingModule } from '@nestjs/testing';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { ROLES } from '../common/constants/roles.constant';

const mockService = {
  findAll: jest.fn(),
  count: jest.fn(),
  marcarTodasLeidas: jest.fn(),
  marcarLeida: jest.fn(),
  remove: jest.fn(),
};

const user = { sub: 2, role: ROLES.CLIENTE, name: 'Cliente', email: 'cliente@test.com', clinicaId: 1 };

describe('NotificacionesController', () => {
  let controller: NotificacionesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificacionesController],
      providers: [{ provide: NotificacionesService, useValue: mockService }],
    }).compile();

    controller = module.get<NotificacionesController>(NotificacionesController);
    jest.clearAllMocks();
  });

  it('propaga CurrentUser y filtro no_leidas al listado', () => {
    mockService.findAll.mockReturnValue([]);

    controller.findAll(user, 'true');

    expect(mockService.findAll).toHaveBeenCalledWith(user, true);
  });

  it('propaga CurrentUser al contador', () => {
    mockService.count.mockReturnValue({ count: 0 });

    controller.count(user);

    expect(mockService.count).toHaveBeenCalledWith(user);
  });

  it('propaga CurrentUser al marcar una notificación como leída', () => {
    mockService.marcarLeida.mockReturnValue({ count: 1 });

    controller.marcarLeida(9, user);

    expect(mockService.marcarLeida).toHaveBeenCalledWith(9, user);
  });

  it('propaga CurrentUser en DELETE de notificaciones', () => {
    mockService.remove.mockReturnValue({ message: 'Notificación eliminada.' });

    controller.remove(9, user);

    expect(mockService.remove).toHaveBeenCalledWith(9, user);
  });
});
