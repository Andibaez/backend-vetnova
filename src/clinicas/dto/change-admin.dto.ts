import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ChangeAdminDto {
  @IsEmail()
  newAdminEmail: string;

  @IsOptional()
  @IsString()
  newAdminNombre?: string;
}
