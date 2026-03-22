import { Controller, Get, Query } from '@nestjs/common'
import { GetAuthContext } from '../auth/decorators/auth-context.decorator'
import type { AuthContext } from '../auth/auth.types'
import { SearchService } from './search.service'
import { SearchQueryDto } from './dto/search.dto'
import type { SearchResponseDto } from '@tailfire/shared-types'

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @GetAuthContext() auth: AuthContext,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(query.q, query.limit ?? 5, auth)
  }
}
