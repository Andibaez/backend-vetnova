import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FacturasService } from './facturas.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ROLES } from '../common/constants/roles.constant';
import { JwtPayload } from '../common/types/jwt-payload.type';

@ApiBearerAuth()
@ApiTags('facturas')
@Controller('facturas')
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  @Roles(ROLES.ADMIN, ROLES.CLIENTE)
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.facturasService.findAll(user);
  }

  @Roles(ROLES.ADMIN, ROLES.CLIENTE)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.facturasService.findOne(id, user);
  }

  @Roles(ROLES.ADMIN)
  @Post()
  create(@Body() dto: CreateFacturaDto) {
    return this.facturasService.create(dto);
  }

  @Roles(ROLES.ADMIN)
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFacturaDto) {
    return this.facturasService.update(id, dto);
  }

  @Roles(ROLES.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.facturasService.remove(id);
  }
}
