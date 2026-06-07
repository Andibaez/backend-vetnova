import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindMascotasDto extends PaginationDto {
  @IsOptional()
  @IsString()
  id_propietario?: string;
}
