import { Test, TestingModule } from '@nestjs/testing';
import { VaccineRemindersCron } from './vaccine-reminders.cron';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const mockPrisma = {
  registro_vacunas: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockMail = {
  sendVaccineReminder: jest.fn(),
};

function registroVacuna(overrides: Record<string, unknown> = {}) {
  return {
    id_registro: 1,
    proxima_fecha: new Date('2026-07-01'),
    vacunas: { nombre: 'Rabia' },
    mascotas: {
      nombre: 'Firulais',
      propietario: { usuarios: { nombre: 'Lorena', email: 'lorena@test.com' } },
    },
    ...overrides,
  };
}

describe('VaccineRemindersCron', () => {
  let cron: VaccineRemindersCron;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaccineRemindersCron,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    cron = module.get<VaccineRemindersCron>(VaccineRemindersCron);
    jest.clearAllMocks();
  });

  it('envía el recordatorio y marca registro_vacunas como enviado', async () => {
    mockPrisma.registro_vacunas.findMany.mockResolvedValue([registroVacuna()]);

    await cron.sendRemindersForTomorrow();

    expect(mockMail.sendVaccineReminder).toHaveBeenCalledWith(
      'lorena@test.com',
      expect.objectContaining({
        nombre: 'Lorena',
        mascota: 'Firulais',
        vacuna: 'Rabia',
      }),
    );
    expect(mockPrisma.registro_vacunas.update).toHaveBeenCalledWith({
      where: { id_registro: 1 },
      data: { recordatorio_enviado: true },
    });
  });

  it('filtra por proxima_fecha de mañana, recordatorio_enviado=false y no archivadas', async () => {
    mockPrisma.registro_vacunas.findMany.mockResolvedValue([]);

    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(0, 0, 0, 0);
    const nextDay = new Date(target);
    nextDay.setDate(nextDay.getDate() + 1);

    await cron.sendRemindersForTomorrow();

    expect(mockPrisma.registro_vacunas.findMany).toHaveBeenCalledWith({
      where: {
        proxima_fecha: { gte: target, lt: nextDay },
        recordatorio_enviado: false,
        archivada_por_migracion: false,
      },
      include: {
        vacunas: { select: { nombre: true } },
        mascotas: {
          select: {
            nombre: true,
            propietario: {
              select: { usuarios: { select: { nombre: true, email: true } } },
            },
          },
        },
      },
    });
  });

  it('no envía ni marca si el propietario no tiene email', async () => {
    mockPrisma.registro_vacunas.findMany.mockResolvedValue([
      registroVacuna({
        mascotas: { nombre: 'Firulais', propietario: { usuarios: null } },
      }),
    ]);

    await cron.sendRemindersForTomorrow();

    expect(mockMail.sendVaccineReminder).not.toHaveBeenCalled();
    expect(mockPrisma.registro_vacunas.update).not.toHaveBeenCalled();
  });

  it('continúa con el resto si el envío de un registro falla', async () => {
    mockPrisma.registro_vacunas.findMany.mockResolvedValue([
      registroVacuna({ id_registro: 1 }),
      registroVacuna({
        id_registro: 2,
        mascotas: {
          nombre: 'Michi',
          propietario: {
            usuarios: { nombre: 'Carlos', email: 'carlos@test.com' },
          },
        },
      }),
    ]);
    mockMail.sendVaccineReminder
      .mockRejectedValueOnce(new Error('fallo de red'))
      .mockResolvedValueOnce(undefined);

    await cron.sendRemindersForTomorrow();

    expect(mockMail.sendVaccineReminder).toHaveBeenCalledTimes(2);
    expect(mockPrisma.registro_vacunas.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.registro_vacunas.update).toHaveBeenCalledWith({
      where: { id_registro: 2 },
      data: { recordatorio_enviado: true },
    });
  });
});
