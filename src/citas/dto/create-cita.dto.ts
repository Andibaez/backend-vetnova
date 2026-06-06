import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const ESTADOS_VALIDOS = [
  'pendiente',
  'confirmada',
  'en espera',
  'en atención',
  'finalizada',
  'cancelada',
  'no asistió',
  'reprogramada',
] as const;

export class CreateCitaDto {
  @IsDateString()
  fecha: string;

  @IsString()
  hora: string;

  @IsOptional()
  @IsIn(ESTADOS_VALIDOS, { message: `estado debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}` })
  estado?: string;

  @IsOptional()
  @IsString()
  servicio?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsInt()
  id_mascota: number;

  @IsOptional()
  @IsInt()
  id_usuario?: number;

  @IsOptional()
  @IsInt()
  id_veterinario?: number;

  /** Nombre del veterinario — usado como fallback si no se envía id_veterinario */
  @IsOptional()
  @IsString()
  veterinario?: string;
}
