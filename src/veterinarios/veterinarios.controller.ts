import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { VeterinariosService } from './veterinarios.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { UpdateVeterinarioDto } from './dto/update-veterinario.dto';

@ApiCookieAuth('vetnova-token')
@ApiTags('veterinarios')
@Controller('veterinarios')
export class VeterinariosController {
  constructor(private readonly veterinariosService: VeterinariosService) {}

  @Roles(ROLES.VETERINARIO)
  @Get('me')
  obtenerPerfil(@CurrentUser() user: JwtPayload) {
    return this.veterinariosService.obtenerPerfil(user.sub);
  }

  @Roles(ROLES.VETERINARIO)
  @Patch('me')
  actualizarPerfil(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVeterinarioDto,
  ) {
    return this.veterinariosService.actualizarPerfil(user.sub, dto);
  }
}
