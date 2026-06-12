import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('productos')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.productosService.findAll(user);
  }

  @Roles(ROLES.ADMIN, ROLES.VETERINARIO)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.productosService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN)
  @Post()
  create(@Body() dto: CreateProductoDto, @CurrentUser() user: JwtPayload) {
    return this.productosService.create(dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductoDto, @CurrentUser() user: JwtPayload) {
    return this.productosService.update(id, dto, user);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.productosService.remove(id, user);
  }
}
