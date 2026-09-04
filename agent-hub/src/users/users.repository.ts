import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 统一查询字段：显式排除 password，响应里永不泄露密码。
 * 这就是"不直接返回数据库实体"的落地方式——select 白名单。
 */
const userSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, select: userSelect });
  }

  findAll() {
    return this.prisma.user.findMany({ select: userSelect });
  }

  findOne(id: number) {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: userSelect });
  }

  /** 认证专用：需要 password 做 bcrypt.compare，故不 select 白名单 */
  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  update(id: number, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  remove(id: number) {
    return this.prisma.user.delete({ where: { id }, select: userSelect });
  }
}
