import { IsString, IsNotEmpty } from 'class-validator';

export class CambiarClinicaDto {
  @IsString()
  @IsNotEmpty()
  clinicaSlug: string;
}
