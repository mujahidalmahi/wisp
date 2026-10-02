import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.deviceId || request.headers['x-device-id'] || request.query?.deviceId || request.body?.deviceId;
  },
);
