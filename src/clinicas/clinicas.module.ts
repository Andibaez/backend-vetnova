import { Module } from '@nestjs/common';
import { ClinicasService } from './clinicas.service';
import { ClinicasController } from './clinicas.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ClinicasController],
  providers: [ClinicasService],
})
export class ClinicasModule {}
