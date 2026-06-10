import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetalleProductoDto {
  @IsInt()
  id_producto: number;

  @IsInt()
  @Min(1)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_unitario: number;
}

export class DetalleServicioDto {
  @IsInt()
  id_servicio: number;

  @IsInt()
  @Min(1)
  cantidad: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  precio_unitario: number;
}

export class CreateFacturaDto {
  @IsOptional()
  @IsInt()
  id_propietario?: number;

  @IsOptional()
  @IsInt()
  id_mascota?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleProductoDto)
  productos?: DetalleProductoDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleServicioDto)
  servicios?: DetalleServicioDto[];
}
