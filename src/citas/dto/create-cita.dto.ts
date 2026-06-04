import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCitaDto {
  @IsDateString()
  fecha: string;

  @IsString()
  hora: string;

  @IsOptional()
  @IsString()
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
}
