import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { HistoriasClinicasService } from './historias-clinicas.service';
import { CreateConsultaDto } from './dto/create-consulta.dto';
import { UpdateConsultaDto } from './dto/update-consulta.dto';
import { DeleteConsultaDto } from './dto/delete-consulta.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiCookieAuth('vetnova-token')
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

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get('mascota/:id_mascota/timeline')
  getTimeline(
    @Param('id_mascota', ParseIntPipe) id_mascota: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.getTimeline(id_mascota, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get('mascota/:id_mascota/download')
  async downloadTimelinePdf(
    @Param('id_mascota', ParseIntPipe) id_mascota: number,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.historiasService.generateTimelinePdf(
      id_mascota,
      user,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="historial-clinico-${id_mascota}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Get('consultas/:id')
  getConsulta(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.getConsulta(id, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Post('consultas')
  createConsulta(
    @Body() dto: CreateConsultaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.createConsulta(dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Put('consultas/:id')
  updateConsulta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsultaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.updateConsulta(id, dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Delete('consultas/:id')
  removeConsulta(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteConsultaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.removeConsulta(id, dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Get('consultas/:id/auditoria')
  getConsultaAuditoria(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.historiasService.getConsultaAuditoria(id, user);
  }
}
