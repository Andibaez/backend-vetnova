import { Module } from '@nestjs/common';
import { PropietariosService } from './propietarios.service';
import { PropietariosController } from './propietarios.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PropietariosController],
  providers: [PropietariosService, PrismaService],
})
export class PropietariosModule {}