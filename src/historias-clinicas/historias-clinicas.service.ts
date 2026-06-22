import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsultaDto } from './dto/create-consulta.dto';
import { UpdateConsultaDto } from './dto/update-consulta.dto';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ROLES } from '../common/constants/roles.constant';

export type TimelineEventType = 'consulta' | 'vacuna';

export interface TimelineEvent {
  tipo: TimelineEventType;
  fecha: Date | null;
  titulo: string;
  descripcion: string | null;
  registradoPor?: string | null;
  proximaFecha?: Date | null;
}

@Injectable()
export class HistoriasClinicasService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMascota(id_mascota: number, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    const historia = await this.prisma.historias_clinicas.findUnique({
      where: { id_mascota },
      include: {
        consultas: {
          include: { usuarios: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
        },
      },
    });

    return historia ?? { id_mascota, consultas: [] };
  }

  /**
   * Construye el timeline completo (consultas + vacunas) de una mascota,
   * ordenado por fecha descendente. Usado por la vista de Cliente y el PDF.
   */
  async getTimeline(id_mascota: number, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota },
      include: { clinicas: { select: { nombre: true } } },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    const [historia, vacunas] = await Promise.all([
      this.prisma.historias_clinicas.findUnique({
        where: { id_mascota },
        include: {
          consultas: {
            include: { usuarios: { select: { nombre: true } } },
            orderBy: { fecha: 'desc' },
          },
        },
      }),
      this.prisma.registro_vacunas.findMany({
        where: { id_mascota },
        include: { vacunas: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
      }),
    ]);

    const eventosConsultas: TimelineEvent[] = (historia?.consultas ?? []).map(
      (c) => ({
        tipo: 'consulta',
        fecha: c.fecha,
        titulo: c.motivo || 'Consulta',
        descripcion: [
          c.diagnostico ? `Diagnóstico: ${c.diagnostico}` : null,
          c.tratamiento ? `Tratamiento: ${c.tratamiento}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
        registradoPor: c.usuarios?.nombre ?? null,
      }),
    );

    const eventosVacunas: TimelineEvent[] = vacunas.map((v) => ({
      tipo: 'vacuna',
      fecha: v.fecha,
      titulo: v.vacunas?.nombre ? `Vacuna: ${v.vacunas.nombre}` : 'Vacuna',
      descripcion: v.proxima_fecha
        ? `Próxima dosis: ${v.proxima_fecha.toISOString().slice(0, 10)}`
        : null,
      proximaFecha: v.proxima_fecha,
    }));

    const eventos = [...eventosConsultas, ...eventosVacunas].sort((a, b) => {
      const fa = a.fecha ? a.fecha.getTime() : 0;
      const fb = b.fecha ? b.fecha.getTime() : 0;
      return fb - fa;
    });

    return {
      mascota: {
        id_mascota: mascota.id_mascota,
        nombre: mascota.nombre,
        especie: mascota.especie,
        raza: mascota.raza,
        clinica: mascota.clinicas?.nombre ?? null,
      },
      eventos,
    };
  }

  async generateTimelinePdf(
    id_mascota: number,
    user: JwtPayload,
  ): Promise<Buffer> {
    const { mascota, eventos } = await this.getTimeline(id_mascota, user);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('Historial clínico', { align: 'left' });
      doc.moveDown(0.3);

      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(`Mascota: ${mascota.nombre ?? '—'}`);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(
          `Especie: ${mascota.especie ?? '—'}   Raza: ${mascota.raza ?? '—'}`,
        );
      if (mascota.clinica) {
        doc.text(`Clínica: ${mascota.clinica}`);
      }
      doc.text(`Generado el: ${new Date().toLocaleDateString('es-CO')}`);
      doc.moveDown(0.8);

      doc
        .moveTo(doc.x, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#CCCCCC')
        .stroke();
      doc.moveDown(0.6);

      if (eventos.length === 0) {
        doc
          .fontSize(11)
          .font('Helvetica')
          .text('No hay eventos clínicos registrados para esta mascota.');
      } else {
        for (const evento of eventos) {
          const fechaStr = evento.fecha
            ? new Date(evento.fecha).toLocaleDateString('es-CO')
            : 'Sin fecha';
          const tipoStr = evento.tipo === 'consulta' ? 'Consulta' : 'Vacuna';

          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#1A0F35')
            .text(`${fechaStr}  ·  ${tipoStr}`);
          doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor('#1A0F35')
            .text(evento.titulo);
          if (evento.descripcion) {
            doc
              .font('Helvetica')
              .fontSize(9.5)
              .fillColor('#444444')
              .text(evento.descripcion);
          }
          if (evento.registradoPor) {
            doc
              .font('Helvetica-Oblique')
              .fontSize(8.5)
              .fillColor('#777777')
              .text(`Registrado por: ${evento.registradoPor}`);
          }
          doc.moveDown(0.6);
        }
      }

      doc.end();
    });
  }

  async createConsulta(dto: CreateConsultaDto, user: JwtPayload) {
    const mascota = await this.prisma.mascotas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    // Obtener o crear la historia clínica de la mascota
    let historia = await this.prisma.historias_clinicas.findUnique({
      where: { id_mascota: dto.id_mascota },
    });
    if (!historia) {
      historia = await this.prisma.historias_clinicas.create({
        data: { id_mascota: dto.id_mascota },
      });
    }

    return this.prisma.consultas.create({
      data: {
        motivo: dto.motivo,
        diagnostico: dto.diagnostico,
        tratamiento: dto.tratamiento,
        id_historia: historia.id_historia,
        id_usuario: user.sub,
      },
      include: { usuarios: { select: { nombre: true } } },
    });
  }

  async updateConsulta(id: number, dto: UpdateConsultaDto, user: JwtPayload) {
    const consulta = await this.prisma.consultas.findUnique({
      where: { id_consulta: id },
      include: { historias_clinicas: { include: { mascotas: true } } },
    });
    if (!consulta) throw new NotFoundException('Consulta no encontrada.');

    const mascota = consulta.historias_clinicas?.mascotas;
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    if (user.role === ROLES.VETERINARIO && consulta.id_usuario !== user.sub) {
      throw new ForbiddenException(
        'Solo puedes editar consultas que tú registraste.',
      );
    }

    return this.prisma.consultas.update({
      where: { id_consulta: id },
      data: {
        ...(dto.motivo !== undefined && { motivo: dto.motivo }),
        ...(dto.diagnostico !== undefined && { diagnostico: dto.diagnostico }),
        ...(dto.tratamiento !== undefined && { tratamiento: dto.tratamiento }),
      },
      include: { usuarios: { select: { nombre: true } } },
    });
  }

  async removeConsulta(id: number, user: JwtPayload) {
    const consulta = await this.prisma.consultas.findUnique({
      where: { id_consulta: id },
      include: { historias_clinicas: { include: { mascotas: true } } },
    });
    if (!consulta) throw new NotFoundException('Consulta no encontrada.');

    const mascota = consulta.historias_clinicas?.mascotas;
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    if (user.role === ROLES.VETERINARIO && consulta.id_usuario !== user.sub) {
      throw new ForbiddenException(
        'Solo puedes eliminar consultas que tú registraste.',
      );
    }

    await this.prisma.consultas.delete({ where: { id_consulta: id } });
    return { message: 'Consulta eliminada.' };
  }

  private requireClinicaId(user?: JwtPayload) {
    if (!user?.clinicaId) {
      throw new ForbiddenException('El usuario no tiene una clínica asociada.');
    }
    return user.clinicaId;
  }

  private async assertMascotaAccess(
    mascota: {
      id_mascota: number;
      id_propietario: number | null;
      id_clinica: number | null;
    },
    user: JwtPayload,
  ) {
    const clinicaId = this.requireClinicaId(user);
    if (mascota.id_clinica !== clinicaId) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a esta historia clínica.',
      );
    }

    if (user.role === ROLES.CLIENTE) {
      const prop = await this.prisma.propietarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (
        !prop ||
        prop.id_clinica !== clinicaId ||
        mascota.id_propietario !== prop.id_propietario
      ) {
        throw new ForbiddenException(
          'No tienes permiso para acceder a esta historia clínica.',
        );
      }
      return;
    }

    if (user.role === ROLES.VETERINARIO) {
      const vet = await this.prisma.veterinarios.findUnique({
        where: { id_usuario: user.sub },
      });
      if (!vet)
        throw new ForbiddenException('No tienes un perfil de veterinario.');

      const asignada = await this.prisma.citas.findFirst({
        where: {
          id_mascota: mascota.id_mascota,
          id_veterinario: vet.id_veterinario,
          id_clinica: clinicaId,
        },
        select: { id_cita: true },
      });
      if (!asignada) {
        throw new ForbiddenException(
          'Solo puedes acceder a pacientes asignados a ti.',
        );
      }
    }
  }
}
