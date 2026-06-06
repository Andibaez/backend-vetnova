import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PropietariosService } from './propietarios.service';
import { CreatePropietarioDto } from './dto/create-propietario.dto';
import { UpdatePropietarioDto } from './dto/update-propietario.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('propietarios')
@Controller('propietarios')
export class PropietariosController {
  constructor(private readonly propietariosService: PropietariosService) {}

  @Roles(ROLES.ADMIN, ROLES.RECEPCIONISTA)
  @Post()
  create(@Body() dto: CreatePropietarioDto) {
    return this.propietariosService.create(dto);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA, ROLES.CLIENTE)
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('id_usuario') idUsuario?: string,
  ) {
    return this.propietariosService.findAll(user, idUsuario ? parseInt(idUsuario, 10) : undefined);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA, ROLES.CLIENTE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.propietariosService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN, ROLES.RECEPCIONISTA, ROLES.CLIENTE)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePropietarioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.propietariosService.updatePropietario(id, dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.propietariosService.deletePropietario(id);
  }
}
