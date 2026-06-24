import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateConsultaDto {
  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsString()
  diagnostico?: string;

  @IsOptional()
  @IsString()
  tratamiento?: string;

  @IsOptional()
  @IsNumber()
  peso?: number;

  @IsOptional()
  @IsNumber()
  temperatura?: number;

  @IsOptional()
  @IsInt()
  frecuencia_cardiaca?: number;

  @IsOptional()
  @IsString()
  recomendaciones?: string;

  /**
   * Justificación obligatoria cuando quien edita NO es el autor original
   * de la consulta (p. ej. un Administrador editando una consulta
   * registrada por un Veterinario). Es distinto del campo clínico `motivo`
   * (motivo de la consulta) — este es el motivo de la AUDITORÍA.
   */
  @IsOptional()
  @IsString()
  motivoAuditoria?: string;
}
