import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindRecordatoriosDto extends PaginationDto {
  @IsOptional()
  @IsString()
  id_mascota?: string;
}
