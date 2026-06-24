import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CambiarClinicaDto {
  @ApiProperty({ example: 'clinica-norte' })
  @IsString()
  @IsNotEmpty()
  clinicaSlug: string;
}
