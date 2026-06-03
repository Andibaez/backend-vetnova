import { Module } from '@nestjs/common';
import { CitasService } from './citas.service';
import { CitasController } from './citas.controller';

@Module({
  controllers: [CitasController],
  providers: [CitasService],
})
export class CitasModule {}
