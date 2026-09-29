import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AccountLinkService } from './account-link.service';
import { LinkLocalDto } from './dto/link-local.dto';
import { AuthGuard } from '../session-store/auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';

@Controller('auth/link')
export class AccountLinkController {
  constructor(private readonly accountLink: AccountLinkService) {}

  @UseGuards(AuthGuard, CsrfGuard)
  @Post('local')
  @HttpCode(200)
  async linkLocal(@Body() dto: LinkLocalDto, @Req() req: Request): Promise<{ ok: true }> {
    const userId = (req as Request & { user: { id: string } }).user.id;
    await this.accountLink.linkLocal(userId, dto.email, dto.password);
    return { ok: true };
  }
}
