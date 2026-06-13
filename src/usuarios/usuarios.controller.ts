import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { FindUsuariosDto } from './dto/find-usuarios.dto';

@ApiCookieAuth('vetnova-token')
@ApiTags('usuarios')
@Roles(ROLES.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  findAll(@Query() query: FindUsuariosDto, @CurrentUser() user: JwtPayload) {
    return this.usuariosService.findAll(user, query.rol, {
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usuariosService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateUsuarioDto, @CurrentUser() user: JwtPayload) {
    return this.usuariosService.create(dto, user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO, ROLES.CLIENTE)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUsuarioDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usuariosService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usuariosService.remove(id, user);
  }
}
