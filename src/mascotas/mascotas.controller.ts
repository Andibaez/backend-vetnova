import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { MascotasService } from './mascotas.service';
import { CreateMascotaDto } from './dto/create.mascota.dto';
import { UpdateMascotaDto } from './dto/update.mascotas.dto';
@Controller('mascotas')
export class MascotasController {
  constructor(private readonly mascotasService: MascotasService) {}

  @Post()
  create(@Body() createMascotaDto: CreateMascotaDto) {
    return this.mascotasService.create(createMascotaDto);
  }

  @Get()
  findAll() {
    return this.mascotasService.findAll();
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateMascotaDto: UpdateMascotaDto,
  ) {
    return this.mascotasService.updateMascota(+id, updateMascotaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.mascotasService.deleteMascota(+id);
  }
}