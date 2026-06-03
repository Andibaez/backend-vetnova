import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { MascotasModule } from './mascotas/mascotas.module';
import { PropietariosModule } from './propietarios/propietarios.module';
import { CitasModule } from './citas/citas.module';

@Module({
  imports: [
    CitasModule,
  ],
})
export class appmodule {}

@Module({
  imports: [
    PrismaModule,
    MascotasModule,
    PropietariosModule,
  ],
})
export class AppModule {}
