import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    create: jest.fn(),
    findByEmailWithPassword: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('register 委托 usersService.create', async () => {
    const dto = { email: 'a@b.com', password: '123456' };
    mockUsersService.create.mockResolvedValue({ id: 1, email: dto.email });

    await expect(service.register(dto)).resolves.toEqual({ id: 1, email: dto.email });
    expect(mockUsersService.create).toHaveBeenCalledWith(dto);
  });

  it('validateUser 密码正确时返回不含 password 的用户', async () => {
    const hash = await bcrypt.hash('123456', 4);
    mockUsersService.findByEmailWithPassword.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      password: hash,
      role: 'user',
    });

    const result = await service.validateUser('a@b.com', '123456');
    expect(result).toEqual({ id: 1, email: 'a@b.com', role: 'user' });
    expect(result).not.toHaveProperty('password');
  });

  it('validateUser 密码错误时返回 null', async () => {
    const hash = await bcrypt.hash('123456', 4);
    mockUsersService.findByEmailWithPassword.mockResolvedValue({
      id: 1,
      email: 'a@b.com',
      password: hash,
      role: 'user',
    });

    await expect(service.validateUser('a@b.com', 'wrong-pass')).resolves.toBeNull();
  });

  it('login 返回 accessToken 和用户信息', () => {
    const user = { id: 1, email: 'a@b.com', role: 'user' as const };
    const result = service.login(user);

    expect(result.accessToken).toBe('signed-token');
    expect(result.user).toEqual(user);
    expect(mockJwtService.sign).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  });
});
