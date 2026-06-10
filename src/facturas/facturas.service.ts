import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

const FACTURA_INCLUDE = {
  propietarios: { select: { nombre: true, email: true } },
  mascotas: { select: { nombre: true } },
  detalle_productos: { include: { productos: { select: { nombre: true } } } },
  detalle_servicios: { include: { servicios: { select: { nombre: true } } } },
} as const;

@Injectable()
export class FacturasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload) {
    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop) return [];
      return this.prisma.facturas.findMany({
        where: { id_propietario: prop.id_propietario },
        include: FACTURA_INCLUDE,
        orderBy: { fecha: 'desc' },
      });
    }
    return this.prisma.facturas.findMany({
      include: FACTURA_INCLUDE,
      orderBy: { fecha: 'desc' },
    });
  }

  async findOne(id: number, user: JwtPayload) {
    const factura = await this.prisma.facturas.findUnique({
      where: { id_factura: id },
      include: FACTURA_INCLUDE,
    });
    if (!factura) throw new NotFoundException('Factura no encontrada.');

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({ where: { id_usuario: user.sub } });
      if (!prop || factura.id_propietario !== prop.id_propietario) {
        throw new ForbiddenException('No tienes permiso para ver esta factura.');
      }
    }
    return factura;
  }

  async create(dto: CreateFacturaDto) {
    const total = this.calcularTotal(dto);

    return this.prisma.$transaction(async (tx) => {
      const factura = await tx.facturas.create({
        data: {
          id_propietario: dto.id_propietario ?? null,
          id_mascota: dto.id_mascota ?? null,
          total,
        },
      });

      if (dto.productos?.length) {
        await tx.detalle_productos.createMany({
          data: dto.productos.map((p) => ({
            id_factura: factura.id_factura,
            id_producto: p.id_producto,
            cantidad: p.cantidad,
            precio_unitario: p.precio_unitario,
          })),
        });
      }

      if (dto.servicios?.length) {
        await tx.detalle_servicios.createMany({
          data: dto.servicios.map((s) => ({
            id_factura: factura.id_factura,
            id_servicio: s.id_servicio,
            cantidad: s.cantidad,
            precio_unitario: s.precio_unitario,
          })),
        });
      }

      return tx.facturas.findUnique({
        where: { id_factura: factura.id_factura },
        include: FACTURA_INCLUDE,
      });
    });
  }

  async update(id: number, dto: UpdateFacturaDto) {
    const factura = await this.prisma.facturas.findUnique({ where: { id_factura: id } });
    if (!factura) throw new NotFoundException('Factura no encontrada.');
    return this.prisma.facturas.update({
      where: { id_factura: id },
      data: { ...(dto.total !== undefined && { total: dto.total }) },
      include: FACTURA_INCLUDE,
    });
  }

  async remove(id: number) {
    const factura = await this.prisma.facturas.findUnique({ where: { id_factura: id } });
    if (!factura) throw new NotFoundException('Factura no encontrada.');
    await this.prisma.$transaction([
      this.prisma.detalle_productos.deleteMany({ where: { id_factura: id } }),
      this.prisma.detalle_servicios.deleteMany({ where: { id_factura: id } }),
      this.prisma.facturas.delete({ where: { id_factura: id } }),
    ]);
    return { message: 'Factura eliminada.' };
  }

  private calcularTotal(dto: CreateFacturaDto): number {
    const totalProductos = (dto.productos ?? []).reduce(
      (sum, p) => sum + p.cantidad * p.precio_unitario,
      0,
    );
    const totalServicios = (dto.servicios ?? []).reduce(
      (sum, s) => sum + s.cantidad * s.precio_unitario,
      0,
    );
    return totalProductos + totalServicios;
  }
}
