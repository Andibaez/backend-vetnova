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
  crearDesdeContactoPublico: jest.fn(),
};

const user = {
  sub: 2,
  role: ROLES.CLIENTE,
  name: 'Cliente',
  email: 'cliente@test.com',
  clinicaId: 1,
};

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

  it('propaga CurrentUser y filtro no_leidas al listado', async () => {
    mockService.findAll.mockReturnValue([]);

    await controller.findAll(user, 'true');

    expect(mockService.findAll).toHaveBeenCalledWith(user, true);
  });

  it('propaga CurrentUser al contador', async () => {
    mockService.count.mockReturnValue({ count: 0 });

    await controller.count(user);

    expect(mockService.count).toHaveBeenCalledWith(user);
  });

  it('propaga CurrentUser al marcar una notificación como leída', async () => {
    mockService.marcarLeida.mockReturnValue({ count: 1 });

    await controller.marcarLeida(9, user);

    expect(mockService.marcarLeida).toHaveBeenCalledWith(9, user);
  });

  it('propaga CurrentUser en DELETE de notificaciones', async () => {
    mockService.remove.mockReturnValue({ message: 'Notificación eliminada.' });

    await controller.remove(9, user);

    expect(mockService.remove).toHaveBeenCalledWith(9, user);
  });

  it('expone POST /notificaciones/contacto sin autenticación', async () => {
    const dto = {
      nombre: 'Lorena',
      email: 'lorena@test.com',
      asunto: 'Consulta general',
      mensaje: 'Hola, tengo una pregunta.',
    };
    mockService.crearDesdeContactoPublico.mockReturnValue({
      message: 'Mensaje recibido.',
    });

    await controller.crearDesdeContactoPublico(dto);

    expect(mockService.crearDesdeContactoPublico).toHaveBeenCalledWith(dto);
  });
});
