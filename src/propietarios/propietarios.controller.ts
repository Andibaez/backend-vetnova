import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    Delete,
  } from '@nestjs/common';
  
  import { PropietariosService } from './propietarios.service';
  import { CreatePropietarioDto } from './dto/create.propietario.dto';
  import { UpdatePropietarioDto } from './dto/update.propietario.dto';
  
  @Controller('propietarios')
  export class PropietariosController {
    constructor(private readonly propietariosService: PropietariosService) {}
  
    // CREATE
    @Post()
    create(@Body() createPropietarioDto: CreatePropietarioDto) {
      return this.propietariosService.create(createPropietarioDto);
    }
  
    // GET ALL
    @Get()
    findAll() {
      return this.propietariosService.findAll();
    }
  
    // GET ONE
    @Get(':id')
    findOne(@Param('id') id: string) {
      return this.propietariosService.findOne(+id);
    }
  
    // UPDATE
    @Put(':id')
    update(
      @Param('id') id: string,
      @Body() updatePropietarioDto: UpdatePropietarioDto,
    ) {
      return this.propietariosService.updatePropietario(+id, updatePropietarioDto);
    }
  
    // DELETE
    @Delete(':id')
    remove(@Param('id') id: string) {
      return this.propietariosService.deletePropietario(+id);
    }
  }