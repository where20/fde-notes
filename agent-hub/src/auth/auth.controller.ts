import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService, AuthenticatedUser } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '注册' })
  @ApiResponse({ status: 201, description: '注册成功（响应无 password）' })
  @ApiResponse({ status: 409, description: '邮箱已存在' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '登录（邮箱 + 密码）' })
  @ApiResponse({ status: 200, description: '登录成功，返回 accessToken' })
  @ApiResponse({ status: 401, description: '邮箱或密码错误' })
  login(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.login(user);
  }
}
