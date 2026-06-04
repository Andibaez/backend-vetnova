import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ServiciosService } from './servicios.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { ROLES } from '../common/constants/roles.constant';

@ApiBearerAuth()
@ApiTags('servicios')
@Controller('servicios')
export class ServiciosController {
  constructor(private readonly serviciosService: ServiciosService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA, ROLES.CLIENTE)
  @Get()
  findAll() {
    return this.serviciosService.findAll();
  }
}
