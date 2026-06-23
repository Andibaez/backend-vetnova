import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  email: string;

  @IsOptional()
  @IsString()
  clinicaSlug?: string;
}
