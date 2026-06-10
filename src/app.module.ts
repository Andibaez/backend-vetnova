import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggingMiddleware } from './common/middleware/logging.middleware';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { MascotasModule } from './mascotas/mascotas.module';
import { PropietariosModule } from './propietarios/propietarios.module';
import { CitasModule } from './citas/citas.module';
import { ProductosModule } from './productos/productos.module';
import { ServiciosModule } from './servicios/servicios.module';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { VeterinariosModule } from './veterinarios/veterinarios.module';
import { RecordatoriosModule } from './recordatorios/recordatorios.module';
import { HistoriasClinicasModule } from './historias-clinicas/historias-clinicas.module';
import { FacturasModule } from './facturas/facturas.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsuariosModule,
    MascotasModule,
    PropietariosModule,
    CitasModule,
    ProductosModule,
    ServiciosModule,
    NotificacionesModule,
    VeterinariosModule,
    RecordatoriosModule,
    HistoriasClinicasModule,
    FacturasModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
