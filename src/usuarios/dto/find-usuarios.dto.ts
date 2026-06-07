import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindUsuariosDto extends PaginationDto {
  @IsOptional()
  @IsString()
  rol?: string;
}
