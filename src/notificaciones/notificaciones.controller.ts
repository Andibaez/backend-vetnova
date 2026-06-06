import { Controller, Get, Patch, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('notificaciones')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Roles(ROLES.ADMIN)
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('no_leidas') noLeidas?: string,
  ) {
    return this.notificacionesService.findAll(user, noLeidas === 'true');
  }

  @Roles(ROLES.ADMIN)
  @Get('count')
  count(@CurrentUser() user: JwtPayload) {
    return this.notificacionesService.count(user);
  }

  @Roles(ROLES.ADMIN)
  @Patch('leer-todas')
  marcarTodasLeidas(@CurrentUser() user: JwtPayload) {
    return this.notificacionesService.marcarTodasLeidas(user);
  }

  @Roles(ROLES.ADMIN)
  @Patch(':id/leer')
  marcarLeida(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificacionesService.marcarLeida(id, user);
  }
}
