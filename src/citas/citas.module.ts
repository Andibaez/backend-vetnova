import { Module } from '@nestjs/common';
import { CitasService } from './citas.service';
import { CitasController } from './citas.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { AppointmentRemindersCron } from './appointment-reminders.cron';

@Module({
  imports: [NotificacionesModule],
  controllers: [CitasController],
  providers: [CitasService, AppointmentRemindersCron],
})
export class CitasModule {}
