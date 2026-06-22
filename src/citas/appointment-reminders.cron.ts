import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/**
 * Envía recordatorios por email de las citas confirmadas que ocurren
 * dentro de las próximas 24 horas.
 *
 * Limitación conocida: el modelo `citas` no tiene un campo para marcar
 * que el recordatorio ya fue enviado (ej. `recordatorio_enviado_at`).
 * Para evitar reenvíos duplicados en re-ejecuciones del mismo día se usa
 * una ventana horaria angosta (el rango de horas correspondiente a "dentro
 * de 24h" calculado a partir de la hora de ejecución del cron, que corre
 * una sola vez al día a las 9:00am). Si el proceso se reinicia o el cron
 * se dispara más de una vez el mismo día, podría reenviarse el recordatorio
 * a las citas que caigan en esa ventana. Si se requiere garantía estricta
 * de envío único, se debe agregar una columna en `citas` (por ejemplo
 * `recordatorio_enviado` boolean) vía migración de Prisma.
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
      await this.mail.sendAppointmentReminder(cita.usuarios.email, {
        nombre: cita.usuarios.nombre ?? 'cliente',
        mascota: cita.mascotas?.nombre ?? 'tu mascota',
        fecha: cita.fecha.toISOString().slice(0, 10),
        hora: cita.hora,
        servicio: cita.servicio,
        veterinario: cita.veterinarios?.usuarios?.nombre ?? null,
      });
    }
  }
}
