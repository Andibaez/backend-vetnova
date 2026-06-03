import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropietarioDto } from './dto/create.propietario.dto';
import { UpdatePropietarioDto } from './dto/update.propietario.dto';

@Injectable()
export class PropietariosService {
  constructor(private prisma: PrismaService) {}

  // CREATE
  create(createPropietarioDto: CreatePropietarioDto) {
    return this.prisma.propietarios.create({
      data: createPropietarioDto,
    });
  }

  // READ ALL
  findAll() {
    return this.prisma.propietarios.findMany({
      include: {
        mascotas: true,
      },
    });
  }

  // READ ONE
  findOne(id: number) {
    return this.prisma.propietarios.findUnique({
      where: {
        id_propietario: id,
      },
      include: {
        mascotas: true,
      },
    });
  }

  // UPDATE
  updatePropietario(id: number, data: UpdatePropietarioDto) {
    return this.prisma.propietarios.update({
      where: {
        id_propietario: id,
      },
      data,
    });
  }

  // DELETE
  deletePropietario(id: number) {
    return this.prisma.propietarios.delete({
      where: {
        id_propietario: id,
      },
    });
  }
}