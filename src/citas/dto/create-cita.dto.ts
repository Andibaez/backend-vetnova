import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCitaDto {
  @IsDateString()
  fecha: string;

  @IsString()
  hora: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsInt()
  id_mascota: number;

  @IsInt()
  id_usuario: number;
}