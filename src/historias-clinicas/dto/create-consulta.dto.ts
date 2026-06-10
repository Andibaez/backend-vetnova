import { IsInt, IsOptional, IsString } from 'class-validator';

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
}
