import { IsOptional, IsString, MinLength } from 'class-validator';

export class GetSessionQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  deviceId?: string;
}
