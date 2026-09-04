import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({ description: '用户 ID', example: 1 })
  id: number;

  @ApiProperty({ description: '邮箱', example: 'xiaoan@example.com' })
  email: string;

  @ApiProperty({ description: '角色', enum: Role, example: Role.user })
  role: Role;

  @ApiProperty({ description: '创建时间', example: '2026-09-03T04:02:44.000Z' })
  createdAt: Date;
}
