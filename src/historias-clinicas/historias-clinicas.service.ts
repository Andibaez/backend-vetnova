import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as path from 'path';
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
          where: this.consultasVisibleWhere(user),
          include: { usuarios: { select: { nombre: true } } },
          orderBy: { fecha: 'desc' },
        },
      },
    });

    return historia ?? { id_mascota, consultas: [] };
  }

  /**
   * El cliente (dueño) siempre ve su historial completo, incluido lo
   * archivado por un cambio de clínica. El personal de la clínica
   * (veterinario/admin) solo ve lo no archivado.
   */
  private consultasVisibleWhere(user: JwtPayload) {
    if (user.role === ROLES.CLIENTE) return { eliminada_at: null };
    return { eliminada_at: null, archivada_por_migracion: false };
  }

  private vacunasVisibleWhere(user: JwtPayload, id_mascota: number) {
    if (user.role === ROLES.CLIENTE) return { id_mascota };
    return { id_mascota, archivada_por_migracion: false };
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
            where: this.consultasVisibleWhere(user),
            include: { usuarios: { select: { nombre: true } } },
            orderBy: { fecha: 'desc' },
          },
        },
      }),
      this.prisma.registro_vacunas.findMany({
        where: this.vacunasVisibleWhere(user, id_mascota),
        include: { vacunas: { select: { nombre: true } } },
        orderBy: { fecha: 'desc' },
      }),
    ]);

    const eventosConsultas: TimelineEvent[] = (historia?.consultas ?? []).map(
      (c) => {
        const signosVitales = [
          c.peso != null ? `Peso: ${c.peso.toString()} kg` : null,
          c.temperatura != null ? `Temp: ${c.temperatura.toString()}°C` : null,
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
              c.recomendaciones
                ? `Recomendaciones: ${c.recomendaciones}`
                : null,
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

  private static readonly PDF_HEADER_HEIGHT = 92;
  private static readonly PDF_BRAND_INDIGO_DARK = '#4347C9';
  private static readonly PDF_BRAND_INDIGO_LIGHT = '#818CF8';
  private static readonly PDF_LOGO_PATH = path.join(
    __dirname,
    'assets',
    'vetnova-icon-white.png',
  );

  private drawPdfHeader(doc: PDFKit.PDFDocument) {
    const { width } = doc.page;
    const gradient = doc
      .linearGradient(0, 0, width, HistoriasClinicasService.PDF_HEADER_HEIGHT)
      .stop(0, HistoriasClinicasService.PDF_BRAND_INDIGO_DARK)
      .stop(1, HistoriasClinicasService.PDF_BRAND_INDIGO_LIGHT);
    doc
      .rect(0, 0, width, HistoriasClinicasService.PDF_HEADER_HEIGHT)
      .fill(gradient);

    try {
      doc.image(HistoriasClinicasService.PDF_LOGO_PATH, 50, 28, {
        width: 34,
      });
    } catch {
      // Si el asset no está disponible (ej. entorno de test), seguimos sin logo.
    }

    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('VetNova', 96, 32);
    doc
      .fillColor('#E0E7FF')
      .font('Helvetica')
      .fontSize(10.5)
      .text('Historial clínico', 96, 54);
    doc.fillColor('#000000');
  }

  private drawPdfFooter(doc: PDFKit.PDFDocument, pageLabel: string) {
    const { width, height, margins } = doc.page;
    const y = height - margins.bottom + 24;
    doc
      .moveTo(margins.left, y)
      .lineTo(width - margins.right, y)
      .strokeColor('#EAEAEA')
      .lineWidth(1)
      .stroke();
    // Texto en height fija para que PDFKit lo recorte en vez de interpretar
    // que "no cabe" y agregar una página nueva (el footer vive a propósito
    // dentro del margen inferior, por debajo de doc.page.maxY()).
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#9D9DBE')
      .text('Generado por VetNova', margins.left, y + 8, {
        width: width - margins.left - margins.right,
        height: 16,
        align: 'left',
        lineBreak: false,
      });
    doc.text(pageLabel, margins.left, y + 8, {
      width: width - margins.left - margins.right,
      height: 16,
      align: 'right',
      lineBreak: false,
    });
  }

  /** Dibuja una tarjeta redondeada con barra lateral de color y devuelve el alto usado. */
  private drawEventCard(
    doc: PDFKit.PDFDocument,
    evento: TimelineEvent,
    width: number,
  ): number {
    const x = doc.page.margins.left;
    const innerX = x + 16;
    const innerWidth = width - 32;
    const accentColor = evento.tipo === 'consulta' ? '#5457E5' : '#10B981';

    const fechaStr = evento.fecha
      ? new Date(evento.fecha).toLocaleDateString('es-CO')
      : 'Sin fecha';
    const tipoStr = evento.tipo === 'consulta' ? 'Consulta' : 'Vacuna';

    doc.font('Helvetica-Bold').fontSize(9.5);
    const metaHeight = doc.heightOfString(
      `${fechaStr}   ·   ${tipoStr.toUpperCase()}`,
      { width: innerWidth },
    );
    doc.font('Helvetica-Bold').fontSize(11.5);
    const tituloHeight = doc.heightOfString(evento.titulo, {
      width: innerWidth,
    });
    let descHeight = 0;
    if (evento.descripcion) {
      doc.font('Helvetica').fontSize(9.5);
      descHeight =
        doc.heightOfString(evento.descripcion, { width: innerWidth }) + 6;
    }
    let registradoHeight = 0;
    if (evento.registradoPor) {
      doc.font('Helvetica-Oblique').fontSize(8.5);
      registradoHeight =
        doc.heightOfString(`Registrado por: ${evento.registradoPor}`, {
          width: innerWidth,
        }) + 6;
    }

    const paddingY = 14;
    const cardHeight =
      paddingY * 2 +
      metaHeight +
      4 +
      tituloHeight +
      descHeight +
      registradoHeight;

    if (doc.y + cardHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    const top = doc.y;
    doc
      .roundedRect(x, top, width, cardHeight, 10)
      .fillAndStroke('#FFFFFF', '#EAEAEA');
    doc.rect(x, top, 4, cardHeight).fill(accentColor);

    let cursorY = top + paddingY;
    doc
      .fillColor('#71719C')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(`${fechaStr}   ·   ${tipoStr.toUpperCase()}`, innerX, cursorY, {
        width: innerWidth,
      });
    cursorY += metaHeight + 4;

    doc
      .fillColor('#15152B')
      .font('Helvetica-Bold')
      .fontSize(11.5)
      .text(evento.titulo, innerX, cursorY, { width: innerWidth });
    cursorY += tituloHeight;

    if (evento.descripcion) {
      cursorY += 6;
      doc
        .fillColor('#3D3D5C')
        .font('Helvetica')
        .fontSize(9.5)
        .text(evento.descripcion, innerX, cursorY, { width: innerWidth });
      cursorY += descHeight - 6;
    }

    if (evento.registradoPor) {
      cursorY += 6;
      doc
        .fillColor('#9D9DBE')
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .text(`Registrado por: ${evento.registradoPor}`, innerX, cursorY, {
          width: innerWidth,
        });
    }

    doc.fillColor('#000000');
    // doc.text() con coordenadas explícitas igual mueve el cursor interno de
    // PDFKit — lo fijamos al valor absoluto correcto en vez de dejar que el
    // último .text() decida dónde queda doc.y.
    doc.y = top + cardHeight;
    return cardHeight;
  }

  async generateTimelinePdf(
    id_mascota: number,
    user: JwtPayload,
  ): Promise<Buffer> {
    const { mascota, eventos } = await this.getTimeline(id_mascota, user);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 116, bottom: 56, left: 50, right: 50 },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const contentWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      this.drawPdfHeader(doc);
      doc.on('pageAdded', () => this.drawPdfHeader(doc));

      // Tarjeta de datos del paciente
      const infoLines = [
        `Mascota: ${mascota.nombre ?? '—'}`,
        `Especie: ${mascota.especie ?? '—'}     Raza: ${mascota.raza ?? '—'}`,
        mascota.clinica ? `Clínica: ${mascota.clinica}` : null,
        `Generado el: ${new Date().toLocaleDateString('es-CO')}`,
      ].filter((line): line is string => Boolean(line));

      const infoCardX = doc.page.margins.left;
      const infoCardTop = doc.y;
      const infoCardHeight = 16 * 2 + infoLines.length * 15;
      doc
        .roundedRect(infoCardX, infoCardTop, contentWidth, infoCardHeight, 10)
        .fill('#F8F8FC');
      let infoY = infoCardTop + 16;
      for (const [i, line] of infoLines.entries()) {
        doc
          .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(10.5)
          .fillColor('#15152B')
          .text(line, infoCardX + 18, infoY, { width: contentWidth - 36 });
        infoY += 15;
      }
      doc.fillColor('#000000');
      doc.y = infoCardTop + infoCardHeight + 22;

      if (eventos.length === 0) {
        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#71719C')
          .text('No hay eventos clínicos registrados para esta mascota.');
      } else {
        for (const evento of eventos) {
          this.drawEventCard(doc, evento, contentWidth);
          doc.y += 12;
        }
      }

      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        this.drawPdfFooter(
          doc,
          `Página ${i - range.start + 1} de ${range.count}`,
        );
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

    // Si quien registra ya no es la clínica actual de la mascota (acceso
    // "legado" por una cita previa a que el cliente migrara de clínica),
    // la consulta queda archivada de entrada: el cliente la ve en su
    // historial, pero no se filtra al personal de la clínica nueva.
    const esEscrituraLegada = mascota.id_clinica !== user.clinicaId;

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
        archivada_por_migracion: esEscrituraLegada,
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

    this.assertMotivoAuditoria(
      consulta.id_usuario,
      dto.motivoAuditoria,
      user,
      'editar',
    );

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

    if (mascota.id_clinica === clinicaId) {
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
        await this.assertVeterinarioAsignado(
          mascota.id_mascota,
          clinicaId,
          user,
        );
      }
      return;
    }

    // La mascota ya no pertenece a esta clínica (el cliente migró a otra).
    // Solo se permite el acceso "legado" si esta clínica tiene una cita con
    // esa mascota — p. ej. una cita que ya estaba pendiente antes de migrar
    // y que el veterinario aún debe poder atender y documentar.
    if (user.role === ROLES.CLIENTE) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a esta historia clínica.',
      );
    }

    const citaVinculada = await this.prisma.citas.findFirst({
      where: { id_mascota: mascota.id_mascota, id_clinica: clinicaId },
      select: { id_cita: true },
    });
    if (!citaVinculada) {
      throw new ForbiddenException(
        'No tienes permiso para acceder a esta historia clínica.',
      );
    }

    if (user.role === ROLES.VETERINARIO) {
      await this.assertVeterinarioAsignado(mascota.id_mascota, clinicaId, user);
    }
  }

  private async assertVeterinarioAsignado(
    id_mascota: number,
    clinicaId: number,
    user: JwtPayload,
  ) {
    const vet = await this.prisma.veterinarios.findUnique({
      where: { id_usuario: user.sub },
    });
    if (!vet)
      throw new ForbiddenException('No tienes un perfil de veterinario.');

    const asignada = await this.prisma.citas.findFirst({
      where: {
        id_mascota,
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
