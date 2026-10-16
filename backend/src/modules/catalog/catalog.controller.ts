import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { GetProgramsQueryDto } from './dto/get-programs-query.dto';
import { ParseSlugPipe } from '../../common/pipes/parse-slug.pipe';
import { ParseEpisodeIdPipe } from '../../common/pipes/parse-episode-id.pipe';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('programs')
  async listPrograms(@Query() query: GetProgramsQueryDto) {
    return this.catalogService.listPrograms(query);
  }

  @Get('programs/:slug')
  async getProgramBySlug(@Param('slug', ParseSlugPipe) slug: string) {
    return this.catalogService.getProgramBySlug(slug);
  }

  @Get('episodes/:episodeId')
  async getEpisodeById(
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
  ) {
    return this.catalogService.getEpisodeById(episodeId);
  }
}
