import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClinicaDto } from './dto/create-clinica.dto';
import { UpdateClinicaDto } from './dto/update-clinica.dto';
import { ROLES } from '../common/constants/roles.constant';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ClinicasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.clinicas.findMany({ orderBy: { nombre: 'asc' } });
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
    const slugExiste = await this.prisma.clinicas.findUnique({ where: { slug: dto.slug } });
    if (slugExiste) throw new ConflictException('Ya existe una clínica con ese slug.');

    const emailExiste = await this.prisma.usuarios.findUnique({ where: { email: dto.adminEmail.toLowerCase() } });
    if (emailExiste) throw new ConflictException('Ya existe una cuenta con ese correo de administrador.');

    return this.prisma.$transaction(async (tx) => {
      const clinica = await tx.clinicas.create({
        data: {
          nombre: dto.nombre.trim(),
          slug: dto.slug.trim().toLowerCase(),
          direccion: dto.direccion,
          telefono: dto.telefono,
          email: dto.email,
        },
      });

      const rol = await tx.roles.findUnique({ where: { nombre: ROLES.ADMIN } });
      const id_rol = rol?.id_rol ?? (await tx.roles.create({ data: { nombre: ROLES.ADMIN } })).id_rol;

      await tx.usuarios.create({
        data: {
          nombre: dto.adminNombre.trim(),
          email: dto.adminEmail.trim().toLowerCase(),
          password: await bcrypt.hash(dto.adminPassword, 10),
          id_rol,
        },
      });

      return clinica;
    });
  }

  async update(id: number, dto: UpdateClinicaDto) {
    const clinica = await this.prisma.clinicas.findUnique({ where: { id_clinica: id } });
    if (!clinica) throw new NotFoundException('Clínica no encontrada.');
    return this.prisma.clinicas.update({ where: { id_clinica: id }, data: dto });
  }
}
