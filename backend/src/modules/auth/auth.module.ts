import { Global, Module } from '@nestjs/common';
import { DeviceTokenService } from '../../common/auth/device-token.service';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { AuthController } from './auth.controller';

@Global()
@Module({
  controllers: [AuthController],
  providers: [DeviceTokenService, DeviceAuthGuard],
  exports: [DeviceTokenService, DeviceAuthGuard],
})
export class AuthModule {}
