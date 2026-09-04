import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockRepo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: mockRepo }],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('create 会把密码 bcrypt 哈希后落库（不存明文）', async () => {
    const dto = { email: 'a@b.com', password: '123456' };
    mockRepo.create.mockResolvedValue({ id: 1, email: dto.email });

    await service.create(dto);

    const arg = mockRepo.create.mock.calls[0][0];
    expect(arg.password).not.toBe(dto.password);
    expect(arg.password).toMatch(/^\$2[aby]\$/); // bcrypt 哈希前缀
  });

  it('findOne 不存在时抛 NotFoundException', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('findAll 委托 repository 返回列表', async () => {
    const users = [{ id: 1, email: 'a@b.com' }];
    mockRepo.findAll.mockResolvedValue(users);

    await expect(service.findAll()).resolves.toEqual(users);
    expect(mockRepo.findAll).toHaveBeenCalled();
  });
});
