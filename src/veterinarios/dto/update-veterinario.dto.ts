import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVeterinarioDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  especialidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  registroProfesional?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  horarioAtencion?: string;
}
