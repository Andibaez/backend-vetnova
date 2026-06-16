import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ROLES_ARRAY } from '../../common/constants/roles.constant';

export class CreateUsuarioDto {
  @IsString()
  nombre: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @Matches(/(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/, {
    message:
      'La contraseña debe tener al menos una mayúscula, un número y un carácter especial.',
  })
  password: string;

  @IsOptional()
  @IsEnum(ROLES_ARRAY, {
    message: `rol debe ser uno de: ${ROLES_ARRAY.join(', ')}`,
  })
  rol?: string;
}
