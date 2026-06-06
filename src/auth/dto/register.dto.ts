import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ROLES_ARRAY } from '../../common/constants/roles.constant';

export class RegisterDto {
  @IsString()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  password: string;

  @IsOptional()
  @IsEnum(ROLES_ARRAY, { message: `rol debe ser uno de: ${ROLES_ARRAY.join(', ')}` })
  rol?: string;
}
