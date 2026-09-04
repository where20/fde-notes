import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 阶段四的 CRUD 是教学接口，先标 @Public 保持可访问；
  // 真实应用应去掉 @Public，让这些接口也走 JWT 认证。
  @Public()
  @Post()
  @ApiOperation({ summary: '创建用户' })
  @ApiResponse({ status: 201, description: '创建成功', type: UserResponseDto })
  @ApiResponse({ status: 400, description: '参数校验失败' })
  create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '查询所有用户' })
  @ApiResponse({ status: 200, description: '成功', type: [UserResponseDto] })
  findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get('profile')
  @ApiOperation({ summary: '获取当前登录用户信息（需 JWT）' })
  @ApiResponse({ status: 200, description: '成功', type: UserResponseDto })
  @ApiResponse({ status: 401, description: '未登录或 token 无效' })
  profile(@CurrentUser() user: UserResponseDto): UserResponseDto {
    return user;
  }

  @Get('admin')
  @Roles(Role.admin)
  @ApiOperation({ summary: '管理员专属接口（RBAC 演示）' })
  @ApiResponse({ status: 200, description: '管理员可访问' })
  @ApiResponse({ status: 403, description: '权限不足' })
  adminOnly(): { message: string } {
    return { message: 'admin only' };
  }

  @Public()
  @Get(':id')
  // Redis 缓存：命中后直接返回缓存，不再查库（观察日志可见第二次无 SQL）
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  @ApiOperation({ summary: '按 ID 查询用户' })
  @ApiResponse({ status: 200, description: '成功', type: UserResponseDto })
  @ApiResponse({ status: 404, description: '用户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Public()
  @Patch(':id')
  @ApiOperation({ summary: '更新用户（部分字段）' })
  @ApiResponse({ status: 200, description: '更新成功', type: UserResponseDto })
  @ApiResponse({ status: 404, description: '用户不存在' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Public()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '删除用户' })
  @ApiResponse({ status: 204, description: '删除成功（无响应体）' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.usersService.remove(id);
  }
}
