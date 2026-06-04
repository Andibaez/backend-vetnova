import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServiciosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.servicios.findMany({
      orderBy: { nombre: 'asc' },
    });
  }
}
