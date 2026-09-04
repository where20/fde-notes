import { SetMetadata } from '@nestjs/common';

/** 标记接口为公开（跳过全局 JWT 认证）的元数据 key */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
