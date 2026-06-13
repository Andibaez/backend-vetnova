import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ClinicasService } from './clinicas.service';
import { CreateClinicaDto } from './dto/create-clinica.dto';
import { UpdateClinicaDto } from './dto/update-clinica.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ROLES } from '../common/constants/roles.constant';

@ApiTags('clinicas')
@Controller('clinicas')
export class ClinicasController {
  constructor(private readonly clinicasService: ClinicasService) {}

  @Public()
  @Get('activas')
  findActivas() {
    return this.clinicasService.findActivas();
  }

  @Public()
  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.clinicasService.findBySlug(slug);
  }

  @ApiCookieAuth('vetnova-token')
  @Roles(ROLES.SUPER_ADMIN)
  @Get()
  findAll() {
    return this.clinicasService.findAll();
  }

  @ApiCookieAuth('vetnova-token')
  @Roles(ROLES.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clinicasService.findOne(id);
  }

  @ApiCookieAuth('vetnova-token')
  @Roles(ROLES.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateClinicaDto) {
    return this.clinicasService.create(dto);
  }

  @ApiCookieAuth('vetnova-token')
  @Roles(ROLES.SUPER_ADMIN)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClinicaDto) {
    return this.clinicasService.update(id, dto);
  }
}
