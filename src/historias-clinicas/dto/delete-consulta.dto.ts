import { IsOptional, IsString } from 'class-validator';

export class DeleteConsultaDto {
  /**
   * Justificación obligatoria cuando quien elimina NO es el autor original
   * de la consulta (p. ej. un Administrador eliminando una consulta
   * registrada por un Veterinario).
   */
  @IsOptional()
  @IsString()
  motivoAuditoria?: string;
}
