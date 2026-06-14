import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CitasService } from './citas.service';
import { CreateCitaDto } from './dto/create-cita.dto';
import { UpdateCitaDto } from './dto/update-cita.dto';
import { FindCitasDto } from './dto/find-citas.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('citas')
@Controller('citas')
export class CitasController {
  constructor(private readonly citasService: CitasService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Post()
  create(@Body() dto: CreateCitaDto, @CurrentUser() user: JwtPayload) {
    return this.citasService.create(dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query() query: FindCitasDto) {
    return this.citasService.findAll(user, query);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.citasService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCitaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.citasService.update(id, dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.citasService.remove(id, user);
  }
}
