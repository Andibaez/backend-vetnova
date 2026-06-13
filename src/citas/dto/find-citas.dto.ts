import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindCitasDto extends PaginationDto {
  @IsOptional()
  @IsString()
  id_usuario?: string;
}
