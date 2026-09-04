import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

/** 认证通过后的用户（不含 password） */
export interface AuthenticatedUser {
  id: number;
  email: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /** 注册：密码加密交给 UsersService.create（内部 bcrypt.hash） */
  register(dto: RegisterDto) {
    return this.usersService.create(dto);
  }

  /** 校验邮箱+密码，供 LocalStrategy 调用；失败返回 null */
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) {
      return null;
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return null;
    }
    const { password: _ignored, ...result } = user;
    return result; // 不含 password
  }

  /** 登录成功：签发 JWT，返回 accessToken + 用户信息 */
  login(user: AuthenticatedUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user,
    };
  }
}
