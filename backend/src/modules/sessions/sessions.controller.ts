import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { GetSessionQueryDto } from './dto/get-session-query.dto';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('sessions')
@UseGuards(DeviceAuthGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /**
   * Retrieves active multi-turn conversation session and bookmarks.
   * Device identity is strictly authenticated and validated.
   */
  @Get(':episodeId')
  async getSession(
    @Param('episodeId', new ParseUUIDPipe({ version: '4' })) episodeId: string,
    @Query() _query: GetSessionQueryDto,
    @CurrentDevice() authenticatedDeviceId: string,
  ) {
    return this.sessionsService.getSession(episodeId, authenticatedDeviceId);
  }

  /**
   * Pins a timestamped AI insight card into bookmarked_moments for this session.
   */
  @Post(':episodeId/bookmarks')
  @HttpCode(HttpStatus.CREATED)
  async createBookmark(
    @Param('episodeId', new ParseUUIDPipe({ version: '4' })) episodeId: string,
    @Body() dto: CreateBookmarkDto,
    @CurrentDevice() authenticatedDeviceId: string,
  ) {
    return this.sessionsService.createBookmark(episodeId, authenticatedDeviceId, dto);
  }
}
