import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsultaDto } from './dto/create-consulta.dto';
import { UpdateConsultaDto } from './dto/update-consulta.dto';
import { DeleteConsultaDto } from './dto/delete-consulta.dto';
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
  idConsulta?: number;
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
          where: { eliminada_at: null },
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
            where: { eliminada_at: null },
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
      (c) => {
        const signosVitales = [
          c.peso != null ? `Peso: ${c.peso} kg` : null,
          c.temperatura != null ? `Temp: ${c.temperatura}°C` : null,
          c.frecuencia_cardiaca != null
            ? `FC: ${c.frecuencia_cardiaca} lpm`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return {
          tipo: 'consulta' as const,
          fecha: c.fecha,
          titulo: c.motivo || 'Consulta',
          descripcion:
            [
              signosVitales || null,
              c.diagnostico ? `Diagnóstico: ${c.diagnostico}` : null,
              c.tratamiento ? `Tratamiento: ${c.tratamiento}` : null,
              c.recomendaciones ? `Recomendaciones: ${c.recomendaciones}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
          registradoPor: c.usuarios?.nombre ?? null,
          idConsulta: c.id_consulta,
        };
      },
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
        peso: dto.peso,
        temperatura: dto.temperatura,
        frecuencia_cardiaca: dto.frecuencia_cardiaca,
        recomendaciones: dto.recomendaciones,
        id_historia: historia.id_historia,
        id_usuario: user.sub,
      },
      include: { usuarios: { select: { nombre: true } } },
    });
  }

  /**
   * Devuelve una consulta con todos sus campos clínicos estructurados
   * (no el `descripcion` combinado del timeline), usado para precargar
   * el formulario de edición.
   */
  async getConsulta(id: number, user: JwtPayload) {
    const consulta = await this.prisma.consultas.findUnique({
      where: { id_consulta: id },
      include: { historias_clinicas: { include: { mascotas: true } } },
    });
    if (!consulta || consulta.eliminada_at) {
      throw new NotFoundException('Consulta no encontrada.');
    }

    const mascota = consulta.historias_clinicas?.mascotas;
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    return consulta;
  }

  async updateConsulta(id: number, dto: UpdateConsultaDto, user: JwtPayload) {
    const consulta = await this.prisma.consultas.findUnique({
      where: { id_consulta: id },
      include: { historias_clinicas: { include: { mascotas: true } } },
    });
    if (!consulta || consulta.eliminada_at) {
      throw new NotFoundException('Consulta no encontrada.');
    }

    const mascota = consulta.historias_clinicas?.mascotas;
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    if (user.role === ROLES.VETERINARIO && consulta.id_usuario !== user.sub) {
      throw new ForbiddenException(
        'Solo puedes editar consultas que tú registraste.',
      );
    }

    this.assertMotivoAuditoria(consulta.id_usuario, dto.motivoAuditoria, user, 'editar');

    const snapshot = this.snapshotConsulta(consulta);

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.consultas.update({
        where: { id_consulta: id },
        data: {
          ...(dto.motivo !== undefined && { motivo: dto.motivo }),
          ...(dto.diagnostico !== undefined && {
            diagnostico: dto.diagnostico,
          }),
          ...(dto.tratamiento !== undefined && {
            tratamiento: dto.tratamiento,
          }),
          ...(dto.peso !== undefined && { peso: dto.peso }),
          ...(dto.temperatura !== undefined && {
            temperatura: dto.temperatura,
          }),
          ...(dto.frecuencia_cardiaca !== undefined && {
            frecuencia_cardiaca: dto.frecuencia_cardiaca,
          }),
          ...(dto.recomendaciones !== undefined && {
            recomendaciones: dto.recomendaciones,
          }),
        },
        include: { usuarios: { select: { nombre: true } } },
      });

      await tx.auditoria_consultas.create({
        data: {
          id_consulta: id,
          id_usuario: user.sub,
          accion: 'actualizacion',
          motivo: dto.motivoAuditoria ?? null,
          datos_anteriores: snapshot,
        },
      });

      return actualizada;
    });
  }

  async removeConsulta(id: number, dto: DeleteConsultaDto, user: JwtPayload) {
    const consulta = await this.prisma.consultas.findUnique({
      where: { id_consulta: id },
      include: { historias_clinicas: { include: { mascotas: true } } },
    });
    if (!consulta || consulta.eliminada_at) {
      throw new NotFoundException('Consulta no encontrada.');
    }

    const mascota = consulta.historias_clinicas?.mascotas;
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    if (user.role === ROLES.VETERINARIO && consulta.id_usuario !== user.sub) {
      throw new ForbiddenException(
        'Solo puedes eliminar consultas que tú registraste.',
      );
    }

    this.assertMotivoAuditoria(
      consulta.id_usuario,
      dto.motivoAuditoria,
      user,
      'eliminar',
    );

    const snapshot = this.snapshotConsulta(consulta);

    await this.prisma.$transaction(async (tx) => {
      await tx.consultas.update({
        where: { id_consulta: id },
        data: { eliminada_at: new Date() },
      });

      await tx.auditoria_consultas.create({
        data: {
          id_consulta: id,
          id_usuario: user.sub,
          accion: 'eliminacion',
          motivo: dto.motivoAuditoria ?? null,
          datos_anteriores: snapshot,
        },
      });
    });

    return { message: 'Consulta eliminada.' };
  }

  async getConsultaAuditoria(id_consulta: number, user: JwtPayload) {
    const consulta = await this.prisma.consultas.findUnique({
      where: { id_consulta },
      include: { historias_clinicas: { include: { mascotas: true } } },
    });
    if (!consulta) throw new NotFoundException('Consulta no encontrada.');

    const mascota = consulta.historias_clinicas?.mascotas;
    if (!mascota) throw new NotFoundException('Mascota no encontrada.');
    await this.assertMascotaAccess(mascota, user);

    return this.prisma.auditoria_consultas.findMany({
      where: { id_consulta },
      include: { usuarios: { select: { nombre: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Regla de negocio: editar/eliminar una consulta que NO fue registrada
   * por el usuario actual exige una justificación (motivoAuditoria). En la
   * práctica el único rol que puede llegar a este punto sin ser el autor es
   * el Administrador (Veterinario ya es bloqueado por completo antes).
   */
  private assertMotivoAuditoria(
    idAutorOriginal: number | null,
    motivoAuditoria: string | undefined,
    user: JwtPayload,
    accion: 'editar' | 'eliminar',
  ) {
    const esAutorOriginal = idAutorOriginal === user.sub;
    if (esAutorOriginal) return;

    if (!motivoAuditoria || !motivoAuditoria.trim()) {
      throw new BadRequestException(
        accion === 'editar'
          ? 'Debes justificar la edición de un registro clínico que no creaste.'
          : 'Debes justificar la eliminación de un registro clínico que no creaste.',
      );
    }
  }

  private snapshotConsulta(consulta: {
    motivo: string | null;
    diagnostico: string | null;
    tratamiento: string | null;
    peso: unknown;
    temperatura: unknown;
    frecuencia_cardiaca: number | null;
    recomendaciones: string | null;
  }) {
    return {
      motivo: consulta.motivo,
      diagnostico: consulta.diagnostico,
      tratamiento: consulta.tratamiento,
      peso: consulta.peso?.toString() ?? null,
      temperatura: consulta.temperatura?.toString() ?? null,
      frecuencia_cardiaca: consulta.frecuencia_cardiaca,
      recomendaciones: consulta.recomendaciones,
    };
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
