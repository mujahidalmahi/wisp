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
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { GetProfilesQueryDto } from './dto/get-profiles-query.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  async getProfiles(@Query() query: GetProfilesQueryDto) {
    return this.profilesService.getProfilesByDeviceId(query.deviceId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Body() dto: CreateProfileDto) {
    return this.profilesService.createProfile(dto);
  }

  @Patch(':profileId')
  async updateProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profilesService.updateProfile(profileId, dto);
  }

  @Post(':profileId/touch')
  @HttpCode(HttpStatus.OK)
  async touchProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ) {
    return this.profilesService.touchProfile(profileId);
  }

  @Delete(':profileId')
  async deleteProfile(
    @Param('profileId', new ParseUUIDPipe({ version: '4' })) profileId: string,
  ) {
    return this.profilesService.deleteProfile(profileId);
  }
}
