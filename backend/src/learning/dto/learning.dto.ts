import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class LearningQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['first_touch', 'last_touch'])
  model?: 'first_touch' | 'last_touch';

  @IsOptional()
  @IsString()
  metric?: string;
}
