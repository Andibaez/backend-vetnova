import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFacturaDto } from './dto/create-factura.dto';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';
import {
  PaginationDto,
  paginate,
  paginatedResponse,
} from '../common/dto/pagination.dto';

const FACTURA_INCLUDE = {
  clinicas: { select: { id_clinica: true, nombre: true, slug: true } },
  propietarios: { select: { nombre: true, email: true, id_clinica: true } },
  mascotas: {
    select: { nombre: true, id_clinica: true, id_propietario: true },
  },
  detalle_productos: { include: { productos: { select: { nombre: true } } } },
  detalle_servicios: { include: { servicios: { select: { nombre: true } } } },
} as const;

@Injectable()
export class FacturasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: JwtPayload, pagination: PaginationDto = {}) {
    const clinicaId = this.requireClinicaId(user);
    const { take, skip } = paginate(pagination.page, pagination.limit);

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!prop)
        return paginatedResponse(
          [],
          0,
          pagination.page ?? 1,
          pagination.limit ?? 20,
        );
      if (prop.id_clinica !== clinicaId) {
        throw new ForbiddenException(
          'No tienes permiso para ver estas facturas.',
        );
      }
      const where = {
        id_clinica: clinicaId,
        id_propietario: prop.id_propietario,
      };
      const [facturas, total] = await Promise.all([
        this.prisma.facturas.findMany({
          where,
          include: FACTURA_INCLUDE,
          orderBy: { fecha: 'desc' },
          take,
          skip,
        }),
        this.prisma.facturas.count({ where }),
      ]);
      return paginatedResponse(
        facturas,
        total,
        pagination.page ?? 1,
        pagination.limit ?? 20,
      );
    }

    const where = { id_clinica: clinicaId };
    const [facturas, total] = await Promise.all([
      this.prisma.facturas.findMany({
        where,
        include: FACTURA_INCLUDE,
        orderBy: { fecha: 'desc' },
        take,
        skip,
      }),
      this.prisma.facturas.count({ where }),
    ]);
    return paginatedResponse(
      facturas,
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }

  async findOne(id: number, user: JwtPayload) {
    const factura = await this.prisma.facturas.findUnique({
      where: { id_factura: id },
      include: FACTURA_INCLUDE,
    });
    if (!factura) throw new NotFoundException('Factura no encontrada.');

    await this.assertFacturaAccess(factura, user);
    return factura;
  }

  async create(dto: CreateFacturaDto, user: JwtPayload) {
    const clinicaId = this.requireClinicaId(user);
    await this.validateFacturaRelations(dto, clinicaId);

    const total = this.calcularTotal(dto);

    return this.prisma.$transaction(async (tx) => {
      const factura = await tx.facturas.create({
        data: {
          id_propietario: dto.id_propietario ?? null,
          id_mascota: dto.id_mascota ?? null,
          id_clinica: clinicaId,
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

  async update(id: number, dto: UpdateFacturaDto, user: JwtPayload) {
    const factura = await this.prisma.facturas.findUnique({
      where: { id_factura: id },
      include: FACTURA_INCLUDE,
    });
    if (!factura) throw new NotFoundException('Factura no encontrada.');
    await this.assertFacturaAccess(factura, user);

    return this.prisma.facturas.update({
      where: { id_factura: id },
      data: { ...(dto.total !== undefined && { total: dto.total }) },
      include: FACTURA_INCLUDE,
    });
  }

  async remove(id: number, user: JwtPayload) {
    const factura = await this.prisma.facturas.findUnique({
      where: { id_factura: id },
      include: FACTURA_INCLUDE,
    });
    if (!factura) throw new NotFoundException('Factura no encontrada.');
    await this.assertFacturaAccess(factura, user);

    await this.prisma.$transaction([
      this.prisma.detalle_productos.deleteMany({ where: { id_factura: id } }),
      this.prisma.detalle_servicios.deleteMany({ where: { id_factura: id } }),
      this.prisma.facturas.delete({ where: { id_factura: id } }),
    ]);
    return { message: 'Factura eliminada.' };
  }

  private calcularTotal(dto: CreateFacturaDto): number {
    const totalProductos = (dto.productos ?? []).reduce(
      (sum, p) => sum + this.round2(p.cantidad * p.precio_unitario),
      0,
    );
    const totalServicios = (dto.servicios ?? []).reduce(
      (sum, s) => sum + this.round2(s.cantidad * s.precio_unitario),
      0,
    );
    return this.round2(totalProductos + totalServicios);
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }

  private async assertFacturaAccess(
    factura: {
      id_propietario: number | null;
      id_clinica: number;
      propietarios?: { id_clinica: number | null } | null;
      mascotas?: { id_clinica: number | null } | null;
    },
    user: JwtPayload,
  ) {
    const clinicaId = this.requireClinicaId(user);
    if (factura.id_clinica !== clinicaId) {
      throw new ForbiddenException('No tienes permiso para ver esta factura.');
    }

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (
        !prop ||
        prop.id_clinica !== clinicaId ||
        factura.id_propietario !== prop.id_propietario
      ) {
        throw new ForbiddenException(
          'No tienes permiso para ver esta factura.',
        );
      }
    }
  }

  private async validateFacturaRelations(
    dto: CreateFacturaDto,
    clinicaId: number,
  ) {
    if (!dto.id_propietario && !dto.id_mascota) {
      throw new BadRequestException(
        'La factura debe estar asociada a un propietario o a una mascota.',
      );
    }

    const propietario = dto.id_propietario
      ? await this.prisma.propietarios.findUnique({
          where: { id_propietario: dto.id_propietario },
        })
      : null;
    if (dto.id_propietario && !propietario)
      throw new NotFoundException('Propietario no encontrado.');
    if (propietario && propietario.id_clinica !== clinicaId) {
      throw new ForbiddenException('El propietario no pertenece a tu clínica.');
    }

    const mascota = dto.id_mascota
      ? await this.prisma.mascotas.findUnique({
          where: { id_mascota: dto.id_mascota },
        })
      : null;
    if (dto.id_mascota && !mascota)
      throw new NotFoundException('Mascota no encontrada.');
    if (mascota && mascota.id_clinica !== clinicaId) {
      throw new ForbiddenException('La mascota no pertenece a tu clínica.');
    }
    if (
      propietario &&
      mascota &&
      mascota.id_propietario !== propietario.id_propietario
    ) {
      throw new BadRequestException(
        'La mascota no pertenece al propietario indicado.',
      );
    }

    const productoIds = [
      ...new Set((dto.productos ?? []).map((p) => p.id_producto)),
    ];
    if (productoIds.length) {
      const total = await this.prisma.productos.count({
        where: { id_producto: { in: productoIds }, id_clinica: clinicaId },
      });
      if (total !== productoIds.length) {
        throw new ForbiddenException(
          'Uno o más productos no pertenecen a tu clínica.',
        );
      }
    }

    const servicioIds = [
      ...new Set((dto.servicios ?? []).map((s) => s.id_servicio)),
    ];
    if (servicioIds.length) {
      const total = await this.prisma.servicios.count({
        where: { id_servicio: { in: servicioIds }, id_clinica: clinicaId },
      });
      if (total !== servicioIds.length) {
        throw new ForbiddenException(
          'Uno o más servicios no pertenecen a tu clínica.',
        );
      }
    }
  }

  private round2(value: number) {
    return Number(value.toFixed(2));
  }
}
