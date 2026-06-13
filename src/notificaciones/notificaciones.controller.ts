import {
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiCookieAuth('vetnova-token')
@ApiTags('notificaciones')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  // Sin @Roles: cualquier usuario autenticado consulta sus propias notificaciones (filtradas por user.sub).
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('no_leidas') noLeidas?: string,
  ) {
    return this.notificacionesService.findAll(user, noLeidas === 'true');
  }

  @Get('count')
  count(@CurrentUser() user: JwtPayload) {
    return this.notificacionesService.count(user);
  }

  @Patch('leer-todas')
  marcarTodasLeidas(@CurrentUser() user: JwtPayload) {
    return this.notificacionesService.marcarTodasLeidas(user);
  }

  @Patch(':id/leer')
  marcarLeida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificacionesService.marcarLeida(id, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificacionesService.remove(id, user);
  }
}
