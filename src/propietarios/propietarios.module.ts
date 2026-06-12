import { Module } from '@nestjs/common';
import { PropietariosService } from './propietarios.service';
import { PropietariosController } from './propietarios.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [NotificacionesModule],
  controllers: [PropietariosController],
  providers: [PropietariosService, PrismaService],
})
export class PropietariosModule {}