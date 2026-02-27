import { Controller, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../auth/decorators/public.decorator'
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard'
import { ClientPortalService } from './client-portal.service'

@ApiTags('Client Portal')
@Controller('client-portal')
@Public()
@UseGuards(PortalAuthGuard)
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}
}
