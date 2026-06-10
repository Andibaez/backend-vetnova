import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.productos.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number) {
    const producto = await this.prisma.productos.findUnique({ where: { id_producto: id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return producto;
  }

  create(dto: CreateProductoDto) {
    return this.prisma.productos.create({ data: dto });
  }

  async update(id: number, dto: UpdateProductoDto) {
    const producto = await this.prisma.productos.findUnique({ where: { id_producto: id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    return this.prisma.productos.update({ where: { id_producto: id }, data: dto });
  }

  async remove(id: number) {
    const producto = await this.prisma.productos.findUnique({ where: { id_producto: id } });
    if (!producto) throw new NotFoundException('Producto no encontrado');
    await this.prisma.$transaction([
      this.prisma.detalle_productos.deleteMany({ where: { id_producto: id } }),
      this.prisma.productos.delete({ where: { id_producto: id } }),
    ]);
    return { message: 'Producto eliminado.' };
  }
}
