import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AccountLinkService } from './account-link.service';
import { LinkLocalDto } from './dto/link-local.dto';
import { AuthGuard } from '../session-store/auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';

@ApiTags('auth')
@Controller('auth/link')
export class AccountLinkController {
  constructor(private readonly accountLink: AccountLinkService) {}

  @ApiCookieAuth('sid')
  @ApiOperation({ summary: 'Gắn thêm local credential (email/password) vào user hiện tại' })
  @ApiResponse({ status: 200, description: 'Link thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập' })
  @ApiResponse({ status: 409, description: 'User đã có local credential hoặc email đã dùng bởi user khác' })
  @UseGuards(AuthGuard, CsrfGuard)
  @Post('local')
  @HttpCode(200)
  async linkLocal(@Body() dto: LinkLocalDto, @Req() req: Request): Promise<{ ok: true }> {
    const userId = (req as Request & { user: { id: string } }).user.id;
    await this.accountLink.linkLocal(userId, dto.email, dto.password);
    return { ok: true };
  }
}
