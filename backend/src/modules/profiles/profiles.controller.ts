import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { GetProfilesQueryDto } from './dto/get-profiles-query.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('profiles')
@UseGuards(DeviceAuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  async getProfiles(
    @Query() query: GetProfilesQueryDto,
    @CurrentDevice() deviceId: string,
  ) {
    return this.profilesService.getProfilesByDeviceId(deviceId || query.deviceId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(
    @Body() dto: CreateProfileDto,
    @CurrentDevice() deviceId: string,
  ) {
    return this.profilesService.createProfile(dto, deviceId);
  }

  @Patch(':profileId')
  async updateProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
    @Body() dto: UpdateProfileDto,
    @CurrentDevice() deviceId: string,
  ) {
    return this.profilesService.updateProfile(profileId, dto, deviceId);
  }

  @Post(':profileId/touch')
  @HttpCode(HttpStatus.OK)
  async touchProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
    @CurrentDevice() deviceId: string,
  ) {
    return this.profilesService.touchProfile(profileId, deviceId);
  }

  @Delete(':profileId')
  async deleteProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
    @CurrentDevice() deviceId: string,
  ) {
    return this.profilesService.deleteProfile(profileId, deviceId);
  }
}
