import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Envía recordatorios por email de las citas confirmadas que ocurren
 * dentro de las próximas 24 horas.
 *
 * Para evitar reenvíos duplicados en re-ejecuciones del mismo día (por
 * ejemplo, reinicio del proceso o redeploy) se usa la columna
 * `recordatorio_enviado` en `citas`: solo se seleccionan citas con
 * `recordatorio_enviado = false`, y cada cita se marca como `true`
 * únicamente después de que el envío del correo resuelva sin error.
 */
@Injectable()
export class AppointmentRemindersCron {
  private readonly logger = new Logger(AppointmentRemindersCron.name);

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

    const citas = await this.prisma.citas.findMany({
      where: {
        estado: 'confirmada',
        fecha: { gte: target, lt: nextDay },
        recordatorio_enviado: false,
      },
      include: {
        mascotas: true,
        usuarios: { select: { nombre: true, email: true } },
        veterinarios: {
          select: { usuarios: { select: { nombre: true } } },
        },
      },
    });

    this.logger.log(
      `Procesando ${citas.length} recordatorio(s) de cita para ${target.toISOString().slice(0, 10)}`,
    );

    for (const cita of citas) {
      if (!cita.usuarios?.email || !cita.fecha || !cita.hora) continue;
      try {
        await this.mail.sendAppointmentReminder(cita.usuarios.email, {
          nombre: cita.usuarios.nombre ?? 'cliente',
          mascota: cita.mascotas?.nombre ?? 'tu mascota',
          fecha: cita.fecha.toISOString().slice(0, 10),
          hora: cita.hora,
          servicio: cita.servicio,
          veterinario: cita.veterinarios?.usuarios?.nombre ?? null,
        });
        await this.prisma.citas.update({
          where: { id_cita: cita.id_cita },
          data: { recordatorio_enviado: true },
        });
      } catch (error) {
        this.logger.error(
          `Error enviando recordatorio de cita ${cita.id_cita}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
