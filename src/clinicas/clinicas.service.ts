import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicaDto } from './dto/create-clinica.dto';
import { UpdateClinicaDto } from './dto/update-clinica.dto';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class ClinicasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.clinicas.findMany({ orderBy: { nombre: 'asc' } });
  }

  async findOne(id: number) {
    const clinica = await this.prisma.clinicas.findUnique({
      where: { id_clinica: id },
    });
    if (!clinica) throw new NotFoundException('Clínica no encontrada.');
    return clinica;
  }

  async findActivas() {
    return this.prisma.clinicas.findMany({
      where: { estado: 'activa' },
      select: {
        nombre: true,
        slug: true,
        direccion: true,
        latitud: true,
        longitud: true,
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const clinica = await this.prisma.clinicas.findUnique({
      where: { slug },
      select: { id_clinica: true, nombre: true, slug: true, estado: true },
    });
    if (!clinica) throw new NotFoundException('Clínica no encontrada.');
    return clinica;
  }

  async create(dto: CreateClinicaDto) {
    const existingSlug = await this.prisma.clinicas.findUnique({
      where: { slug: dto.slug },
    });
    if (existingSlug)
      throw new ConflictException('Ya existe una clínica con ese slug.');

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const existingAdmin = await this.prisma.usuarios.findFirst({
      where: { email: adminEmail },
    });
    if (existingAdmin)
      throw new ConflictException('Ya existe un usuario con ese correo.');

    const hashed = await bcrypt.hash(dto.adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const clinica = await tx.clinicas.create({
        data: {
          nombre: dto.nombre.trim(),
          slug: dto.slug.trim().toLowerCase(),
          direccion: dto.direccion,
          telefono: dto.telefono,
          email: dto.email,
          latitud: dto.latitud,
          longitud: dto.longitud,
        },
      });

      let rolAdmin = await tx.roles.findUnique({
        where: { nombre: ROLES.ADMIN },
      });
      if (!rolAdmin)
        rolAdmin = await tx.roles.create({ data: { nombre: ROLES.ADMIN } });

      await tx.usuarios.create({
        data: {
          nombre: dto.adminNombre.trim(),
          email: adminEmail,
          password: hashed,
          id_rol: rolAdmin.id_rol,
          id_clinica: clinica.id_clinica,
        },
      });

      return clinica;
    });
  }

  async update(id: number, dto: UpdateClinicaDto) {
    await this.findOne(id);
    return this.prisma.clinicas.update({
      where: { id_clinica: id },
      data: dto,
    });
  }
}
