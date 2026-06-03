import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePropietarioDto {
  @IsString()
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;
}
