import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropietarioDto } from './dto/create-propietario.dto';
import { UpdatePropietarioDto } from './dto/update-propietario.dto';

@Injectable()
export class PropietariosService {
  constructor(private prisma: PrismaService) {}

  create(createPropietarioDto: CreatePropietarioDto) {
    return this.prisma.propietarios.create({
      data: createPropietarioDto,
    });
  }

  findAll() {
    return this.prisma.propietarios.findMany({
      include: {
        mascotas: true,
      },
    });
  }

  async findOne(id: number) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
      include: { mascotas: true },
    });

    if (!propietario) {
      throw new NotFoundException('Propietario no encontrado');
    }

    return propietario;
  }

  async updatePropietario(id: number, data: UpdatePropietarioDto) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
    });

    if (!propietario) {
      throw new NotFoundException('Propietario no existe');
    }

    return this.prisma.propietarios.update({
      where: { id_propietario: id },
      data,
    });
  }

  async deletePropietario(id: number) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: id },
    });

    if (!propietario) {
      throw new NotFoundException('Propietario no existe');
    }

    return this.prisma.propietarios.delete({
      where: { id_propietario: id },
    });
  }
}
