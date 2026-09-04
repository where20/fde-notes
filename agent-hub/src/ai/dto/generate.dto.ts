import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GenerateDto {
  @ApiProperty({ description: '生成提示词', example: '写一段关于深圳的介绍' })
  @IsString({ message: 'prompt 必须是字符串' })
  @IsNotEmpty({ message: 'prompt 不能为空' })
  @MaxLength(500, { message: 'prompt 最多 500 字' })
  prompt: string;
}
