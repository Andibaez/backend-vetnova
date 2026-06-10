import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const ESTADOS = ['pendiente', 'enviado', 'cancelado'] as const;

export class CreateRecordatorioDto {
  @IsString()
  mensaje: string;

  @IsDateString()
  fecha_recordatorio: string;

  @IsInt()
  id_mascota: number;

  @IsOptional()
  @IsIn(ESTADOS, { message: `estado debe ser uno de: ${ESTADOS.join(', ')}` })
  estado?: string;
}
