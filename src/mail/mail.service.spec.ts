import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

interface SendArgs {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface SendResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

const mockSend = jest.fn<Promise<SendResult>, [SendArgs]>();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (args: SendArgs) => mockSend(args) },
  })),
}));

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('re_test_key'),
};

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });
  });

  it('envía la confirmación de cita vía Resend con el remitente correcto', async () => {
    await service.sendAppointmentConfirmation('cliente@test.com', {
      nombre: 'Lorena',
      mascota: 'Firulais',
      fecha: '2026-07-01',
      hora: '10:00',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.from).toBe('VetNova <notificaciones@vetnova.online>');
    expect(call.to).toBe('cliente@test.com');
    expect(call.subject).toBe('Confirmación de tu cita — VetNova');
    expect(call.html).toContain('Tu cita fue confirmada');
    expect(call.html).toContain('Firulais');
  });

  it('envía el correo de reprogramación con su propia plantilla', async () => {
    await service.sendAppointmentRescheduled('cliente@test.com', {
      nombre: 'Lorena',
      mascota: 'Firulais',
      fecha: '2026-07-05',
      hora: '11:00',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toBe('Tu cita fue reprogramada — VetNova');
    expect(call.html).toContain('Tu cita fue reprogramada');
  });

  it('envía el aviso de inasistencia con su propia plantilla', async () => {
    await service.sendAppointmentNoShow('cliente@test.com', {
      nombre: 'Lorena',
      mascota: 'Firulais',
      fecha: '2026-07-05',
      hora: '11:00',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toBe('No asististe a tu cita — VetNova');
    expect(call.html).toContain('Firulais');
  });

  it('envía el recordatorio de vacuna con el nombre de la vacuna', async () => {
    await service.sendVaccineReminder('cliente@test.com', {
      nombre: 'Lorena',
      mascota: 'Firulais',
      vacuna: 'Rabia',
      fecha: '2026-07-10',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toBe('Recordatorio de vacuna para Firulais — VetNova');
    expect(call.html).toContain('Rabia');
  });

  it('envía el aviso de nuevo cliente al administrador', async () => {
    await service.sendNewClientNotice('admin@test.com', {
      adminNombre: 'Admin',
      clienteNombre: 'Lorena',
      clienteEmail: 'lorena@test.com',
      clinica: 'BioVet Center',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toBe('Nuevo cliente registrado — VetNova');
    expect(call.html).toContain('BioVet Center');
    expect(call.html).toContain('lorena@test.com');
  });

  it('envía el aviso de cliente migrado al administrador de la clínica destino', async () => {
    await service.sendClientMigratedNotice('admin@test.com', {
      adminNombre: 'Admin',
      clienteNombre: 'Lorena',
      clienteEmail: 'lorena@test.com',
      clinicaAnterior: 'Clínica Origen',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toBe(
      'Un cliente migró su cuenta a tu clínica — VetNova',
    );
    expect(call.html).toContain('Clínica Origen');
  });

  it('no lanza si Resend devuelve un error — solo lo registra', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified' },
    });

    await expect(
      service.sendAppointmentCancelled('cliente@test.com', {
        nombre: 'Lorena',
        mascota: 'Firulais',
        fecha: '2026-07-01',
        hora: '10:00',
      }),
    ).resolves.toBeUndefined();
  });

  it('no lanza si la llamada a Resend falla con una excepción', async () => {
    mockSend.mockRejectedValue(new Error('network error'));

    await expect(
      service.sendWelcome('cliente@test.com', { nombre: 'Lorena' }),
    ).resolves.toBeUndefined();
  });
});
