import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Envía recordatorios por email de las vacunas cuya próxima dosis cae
 * dentro de las próximas 24 horas.
 *
 * Igual que con los recordatorios de citas, se usa la columna
 * `recordatorio_enviado` en `registro_vacunas` para no reenviar en
 * re-ejecuciones del mismo día (reinicio del proceso, redeploy, etc.).
 * Las vacunas archivadas por un cambio de clínica del cliente
 * (`archivada_por_migracion`) se excluyen: ya no son responsabilidad
 * de la clínica que las registró.
 */
@Injectable()
export class VaccineRemindersCron {
  private readonly logger = new Logger(VaccineRemindersCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Cron('0 9 * * *')
  async handleDailyReminders() {
    await this.sendRemindersForTomorrow();
  }

  /** Extraído para poder invocarse también desde tests o manualmente. */
  async sendRemindersForTomorrow() {
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(0, 0, 0, 0);

    const nextDay = new Date(target);
    nextDay.setDate(nextDay.getDate() + 1);

    const registros = await this.prisma.registro_vacunas.findMany({
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

    this.logger.log(
      `Procesando ${registros.length} recordatorio(s) de vacuna para ${target.toISOString().slice(0, 10)}`,
    );

    for (const registro of registros) {
      const email = registro.mascotas?.propietario?.usuarios?.email;
      if (!email || !registro.proxima_fecha) continue;
      try {
        await this.mail.sendVaccineReminder(email, {
          nombre: registro.mascotas?.propietario?.usuarios?.nombre ?? 'cliente',
          mascota: registro.mascotas?.nombre ?? 'tu mascota',
          vacuna: registro.vacunas?.nombre ?? 'Vacuna',
          fecha: registro.proxima_fecha.toISOString().slice(0, 10),
        });
        await this.prisma.registro_vacunas.update({
          where: { id_registro: registro.id_registro },
          data: { recordatorio_enviado: true },
        });
      } catch (error) {
        this.logger.error(
          `Error enviando recordatorio de vacuna ${registro.id_registro}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
