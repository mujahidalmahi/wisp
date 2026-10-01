import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { GetProgramsQueryDto } from './dto/get-programs-query.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('programs')
  async listPrograms(@Query() query: GetProgramsQueryDto) {
    return this.catalogService.listPrograms(query);
  }

  @Get('programs/:slug')
  async getProgramBySlug(@Param('slug') slug: string) {
    return this.catalogService.getProgramBySlug(slug);
  }

  @Get('episodes/:episodeId')
  async getEpisodeById(
    @Param('episodeId', new ParseUUIDPipe({ version: '4' })) episodeId: string,
  ) {
    return this.catalogService.getEpisodeById(episodeId);
  }
}
