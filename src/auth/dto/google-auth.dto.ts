import { IsEmail, IsString, IsOptional } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  picture?: string;
}
