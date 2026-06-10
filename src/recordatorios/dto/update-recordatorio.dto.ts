import { PartialType } from '@nestjs/mapped-types';
import { CreateRecordatorioDto } from './create-recordatorio.dto';

export class UpdateRecordatorioDto extends PartialType(CreateRecordatorioDto) {}
