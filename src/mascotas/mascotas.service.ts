import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMascotaDto } from './dto/create.mascota.dto';
import { UpdateMascotaDto } from './dto/update.mascotas.dto';

@Injectable()
export class MascotasService {
  constructor(private prisma: PrismaService) {}

  // CREATE
  async create(dto: CreateMascotaDto) {
    const propietario = await this.prisma.propietarios.findUnique({
      where: { id_propietario: dto.id_propietario },
    });
  
    if (!propietario) {
      throw new BadRequestException('Propietario no existe');
    }
  
    return this.prisma.mascotas.create({ data: dto });
  }
  findAll() {
    return this.prisma.mascotas.findMany({
      include: {
        propietario: true,
      },
    });
  }
  // GET ONE
  async findOne(id: number) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
      include: { propietario: true },
    });
  
    if (!mascota) {
      throw new NotFoundException('Mascota no encontrada');
    }
  
    return mascota;
  }

  // UPDATE
  async updateMascota(id: number, dto: UpdateMascotaDto) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
    });
  
    if (!mascota) {
      throw new NotFoundException('Mascota no existe');
    }
  
    return this.prisma.mascotas.update({
      where: { id_mascota: id },
      data: dto,
    });
  }
  // DELETE
  async deleteMascota(id: number) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: id },
    });
  
    if (!mascota) {
      throw new NotFoundException('Mascota no existe');
    }
  
    return this.prisma.mascotas.delete({
      where: { id_mascota: id },
    });
  }
}