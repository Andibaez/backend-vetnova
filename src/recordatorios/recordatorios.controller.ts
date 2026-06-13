import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { RecordatoriosService } from './recordatorios.service';
import { CreateRecordatorioDto } from './dto/create-recordatorio.dto';
import { UpdateRecordatorioDto } from './dto/update-recordatorio.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { FindRecordatoriosDto } from './dto/find-recordatorios.dto';

@ApiCookieAuth('vetnova-token')
@ApiTags('recordatorios')
@Controller('recordatorios')
export class RecordatoriosController {
  constructor(private readonly recordatoriosService: RecordatoriosService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: FindRecordatoriosDto,
  ) {
    return this.recordatoriosService.findAll(
      user,
      query.id_mascota ? parseInt(query.id_mascota, 10) : undefined,
      { page: query.page, limit: query.limit },
    );
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.recordatoriosService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Post()
  create(@Body() dto: CreateRecordatorioDto, @CurrentUser() user: JwtPayload) {
    return this.recordatoriosService.create(dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRecordatorioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.recordatoriosService.update(id, dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.recordatoriosService.remove(id, user);
  }
}
