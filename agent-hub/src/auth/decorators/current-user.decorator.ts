import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 从 request.user 提取当前登录用户。
 * 传 key 时只取对应字段：@CurrentUser('email') → user.email
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
