import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

/** 标记接口所需角色的元数据 key */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
