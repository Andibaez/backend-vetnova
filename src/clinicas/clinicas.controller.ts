import { Body, Controller, Get, Param, Post, Put, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClinicasService } from './clinicas.service';
import { CreateClinicaDto } from './dto/create-clinica.dto';
import { UpdateClinicaDto } from './dto/update-clinica.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ROLES } from '../common/constants/roles.constant';

@ApiBearerAuth()
@ApiTags('clinicas')
@Controller('clinicas')
export class ClinicasController {
  constructor(private readonly clinicasService: ClinicasService) {}

  @Roles(ROLES.SUPER_ADMIN)
  @Get()
  findAll() {
    return this.clinicasService.findAll();
  }

  @Roles(ROLES.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateClinicaDto) {
    return this.clinicasService.create(dto);
  }

  @Roles(ROLES.SUPER_ADMIN)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClinicaDto) {
    return this.clinicasService.update(id, dto);
  }

  @Public()
  @Get('by-slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.clinicasService.findBySlug(slug);
  }
}
