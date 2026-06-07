import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateVeterinarioDto } from './dto/update-veterinario.dto';

function toPerfil(v: {
  especialidad: string | null;
  licencia: string | null;
  telefono: string | null;
  horario_atencion: string | null;
}) {
  return {
    especialidad: v.especialidad,
    registroProfesional: v.licencia,
    telefono: v.telefono,
    horarioAtencion: v.horario_atencion,
  };
}

@Injectable()
export class VeterinariosService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPerfil(id_usuario: number) {
    const veterinario = await this.prisma.veterinarios.findUnique({
      where: { id_usuario },
    });
    if (!veterinario) {
      throw new NotFoundException('No tienes un perfil de veterinario.');
    }
    return toPerfil(veterinario);
  }

  async actualizarPerfil(id_usuario: number, dto: UpdateVeterinarioDto) {
    const veterinario = await this.prisma.veterinarios.findUnique({
      where: { id_usuario },
    });
    if (!veterinario) {
      throw new NotFoundException('No tienes un perfil de veterinario.');
    }

    const actualizado = await this.prisma.veterinarios.update({
      where: { id_usuario },
      data: {
        especialidad: dto.especialidad,
        licencia: dto.registroProfesional,
        telefono: dto.telefono,
        horario_atencion: dto.horarioAtencion,
      },
    });

    return toPerfil(actualizado);
  }
}
