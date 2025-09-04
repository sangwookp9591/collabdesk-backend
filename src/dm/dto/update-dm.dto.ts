import { PartialType } from '@nestjs/swagger';
import { CreateDmDto } from './create-dm.dto';

export class UpdateDmDto extends PartialType(CreateDmDto) {}
