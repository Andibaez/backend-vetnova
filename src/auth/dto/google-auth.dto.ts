import { IsOptional, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString()
  credential: string;

  @IsOptional()
  @IsString()
  clinicaSlug?: string;
}
