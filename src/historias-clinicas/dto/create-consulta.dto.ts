import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateConsultaDto {
  @IsInt()
  id_mascota: number;

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
}
