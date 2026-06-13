import { Controller, Get, Post, Body, Param, Put, Delete, Query, ParseIntPipe } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { MascotasService } from './mascotas.service';
import { CreateMascotaDto } from './dto/create.mascota.dto';
import { UpdateMascotaDto } from './dto/update.mascotas.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { FindMascotasDto } from './dto/find-mascotas.dto';

@ApiCookieAuth('vetnova-token')
@ApiTags('mascotas')
@Controller('mascotas')
export class MascotasController {
  constructor(private readonly mascotasService: MascotasService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Post()
  create(@Body() dto: CreateMascotaDto, @CurrentUser() user: JwtPayload) {
    return this.mascotasService.create(dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: FindMascotasDto) {
    return this.mascotasService.findAll(
      user,
      query.id_propietario ? parseInt(query.id_propietario, 10) : undefined,
      { page: query.page, limit: query.limit },
    );
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.mascotasService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
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
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.mascotasService.deleteMascota(id, user);
  }
}
