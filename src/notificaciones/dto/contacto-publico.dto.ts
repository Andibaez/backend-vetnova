import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ContactoPublicoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  nombre: string;

  @IsEmail({}, { message: 'Ingresa un correo electrónico válido.' })
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  asunto: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  mensaje: string;
}
