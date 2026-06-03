import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCitaDto } from './dto/create-cita.dto';
import { UpdateCitaDto } from './dto/update-cita.dto';

@Injectable()
export class CitasService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCitaDto) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });

    const usuario = await this.prisma.usuarios.findUnique({
      where: { id_usuario: dto.id_usuario },
    });

    if (!mascota) {
      throw new BadRequestException('La mascota no existe');
    }

    if (!usuario) {
      throw new BadRequestException('El usuario no existe');
    }

    return this.prisma.citas.create({
      data: {
        fecha: new Date(dto.fecha),
        hora: dto.hora,
        estado: dto.estado ?? 'pendiente',
        id_mascota: dto.id_mascota,
        id_usuario: dto.id_usuario,
      },
    });
  }

  findAll() {
    return this.prisma.citas.findMany({
      include: {
        mascotas: true,
        usuarios: true,
      },
    });
  }

  async findOne(id: number) {
    const cita = await this.prisma.citas.findUnique({
      where: { id_cita: id },
      include: {
        mascotas: true,
        usuarios: true,
      },
    });

    if (!cita) {
      throw new NotFoundException('Cita no encontrada');
    }

    return cita;
  }

  async update(id: number, dto: UpdateCitaDto) {
    const cita = await this.prisma.citas.findUnique({
      where: { id_cita: id },
    });

    if (!cita) {
      throw new NotFoundException('Cita no existe');
    }

    return this.prisma.citas.update({
      where: { id_cita: id },
      data: dto,
    });
  }

  async remove(id: number) {
    const cita = await this.prisma.citas.findUnique({
      where: { id_cita: id },
    });

    if (!cita) {
      throw new NotFoundException('Cita no existe');
    }

    return this.prisma.citas.delete({
      where: { id_cita: id },
    });
  }
}
