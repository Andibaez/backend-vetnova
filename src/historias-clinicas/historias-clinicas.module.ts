import { Module } from '@nestjs/common';
import { HistoriasClinicasService } from './historias-clinicas.service';
import { HistoriasClinicasController } from './historias-clinicas.controller';
import { VaccineRemindersCron } from './vaccine-reminders.cron';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HistoriasClinicasController],
  providers: [HistoriasClinicasService, VaccineRemindersCron],
})
export class HistoriasClinicasModule {}
