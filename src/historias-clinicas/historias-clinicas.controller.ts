import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HistoriasClinicasService } from './historias-clinicas.service';
import { CreateConsultaDto } from './dto/create-consulta.dto';
import { UpdateConsultaDto } from './dto/update-consulta.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('historias-clinicas')
@Controller('historias-clinicas')
export class HistoriasClinicasController {
  constructor(private readonly historiasService: HistoriasClinicasService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get('mascota/:id_mascota')
  findByMascota(
    @Param('id_mascota', ParseIntPipe) id_mascota: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.findByMascota(id_mascota, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Post('consultas')
  createConsulta(@Body() dto: CreateConsultaDto, @CurrentUser() user: JwtPayload) {
    return this.historiasService.createConsulta(dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Put('consultas/:id')
  updateConsulta(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConsultaDto) {
    return this.historiasService.updateConsulta(id, dto);
  }

  @Roles(ROLES.ADMIN)
  @Delete('consultas/:id')
  removeConsulta(@Param('id', ParseIntPipe) id: number) {
    return this.historiasService.removeConsulta(id);
  }
}
