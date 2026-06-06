import { Module } from '@nestjs/common';
import { CitasService } from './citas.service';
import { CitasController } from './citas.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [NotificacionesModule],
  controllers: [CitasController],
  providers: [CitasService],
})
export class CitasModule {}
