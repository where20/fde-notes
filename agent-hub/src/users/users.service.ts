import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto) {
    // 密码永不存明文：统一在这里 bcrypt 哈希
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.usersRepository.create({ ...dto, password: hashedPassword });
  }

  findAll() {
    return this.usersRepository.findAll();
  }

  findByEmail(email: string) {
    return this.usersRepository.findByEmail(email);
  }

  findByEmailWithPassword(email: string) {
    return this.usersRepository.findByEmailWithPassword(email);
  }

  async findOne(id: number) {
    const user = await this.usersRepository.findOne(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id); // 先确认存在，否则 update 会抛 Prisma 内部错误
    return this.usersRepository.update(id, dto);
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.usersRepository.remove(id);
  }
}
