import { IsString, IsInt, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateMascotaDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  especie: string;

  @IsString()
  raza: string;

  @IsInt()
  edad: number;

  @IsOptional()
  @IsInt()
  id_propietario?: number;
}