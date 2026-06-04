import { IsString, IsInt, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateMascotaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  especie?: string;

  @IsOptional()
  @IsString()
  raza?: string;

  @IsOptional()
  @IsInt()
  edad?: number;

  @IsOptional()
  peso?: number;

  @IsOptional()
  @IsString()
  sexo?: string;

  @IsOptional()
  @IsString()
  fecha_nacimiento?: string;

  @IsOptional()
  @IsString()
  foto?: string;

  @IsOptional()
  @IsInt()
  id_propietario?: number;
}
