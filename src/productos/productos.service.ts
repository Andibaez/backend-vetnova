import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: JwtPayload) {
    const where =
      user.role === ROLES.SUPER_ADMIN
        ? {}
        : { id_clinica: this.requireClinicaId(user) };
    return this.prisma.productos.findMany({
      where,
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const producto = await this.prisma.productos.findUnique({
      where: { id_producto: id },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      producto.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Producto no encontrado');
    }
    return producto;
  }

  create(dto: CreateProductoDto, user: JwtPayload) {
    return this.prisma.productos.create({
      data: { ...dto, id_clinica: this.requireClinicaId(user) },
    });
  }

  async update(id: number, dto: UpdateProductoDto, user: JwtPayload) {
    const producto = await this.prisma.productos.findUnique({
      where: { id_producto: id },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      producto.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Producto no encontrado');
    }
    return this.prisma.productos.update({
      where: { id_producto: id },
      data: dto,
    });
  }

  async remove(id: number, user: JwtPayload) {
    const producto = await this.prisma.productos.findUnique({
      where: { id_producto: id },
    });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    if (
      user.role !== ROLES.SUPER_ADMIN &&
      producto.id_clinica !== user.clinicaId
    ) {
      throw new NotFoundException('Producto no encontrado');
    }
    await this.prisma.$transaction([
      this.prisma.detalle_productos.deleteMany({ where: { id_producto: id } }),
      this.prisma.movimientos_inventario.deleteMany({
        where: { id_producto: id },
      }),
      this.prisma.productos.delete({ where: { id_producto: id } }),
    ]);
    return { message: 'Producto eliminado.' };
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }
}
