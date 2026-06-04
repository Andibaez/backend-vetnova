import { Controller, Get, Post, Body, Param, Put, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MascotasService } from './mascotas.service';
import { CreateMascotaDto } from './dto/create.mascota.dto';
import { UpdateMascotaDto } from './dto/update.mascotas.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('mascotas')
@Controller('mascotas')
export class MascotasController {
  constructor(private readonly mascotasService: MascotasService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA)
  @Post()
  create(@Body() dto: CreateMascotaDto) {
    return this.mascotasService.create(dto);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA, ROLES.CLIENTE)
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('id_propietario') id_propietario?: string,
  ) {
    return this.mascotasService.findAll(
      user,
      id_propietario ? parseInt(id_propietario, 10) : undefined,
    );
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA, ROLES.CLIENTE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.mascotasService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.RECEPCIONISTA)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMascotaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.mascotasService.updateMascota(id, dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.mascotasService.deleteMascota(id);
  }
}
