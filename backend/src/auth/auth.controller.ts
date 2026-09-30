import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from '../local-credential/dto/register.dto';
import { LoginDto } from '../local-credential/dto/login.dto';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AuthGuard } from '../session-store/auth.guard';
import '../session-store/session.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({ summary: 'Đăng ký tài khoản bằng email/password (cần CSRF token)' })
  @ApiResponse({ status: 200, description: 'Đăng ký thành công, session đã được set' })
  @ApiResponse({ status: 409, description: 'Email đã tồn tại' })
  @UseGuards(ThrottlerGuard, CsrfGuard)
  @Post('register')
  @HttpCode(200)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.auth.register(dto.email, dto.password, req);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Đăng nhập bằng email/password (cần CSRF token)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, session đã được set' })
  @ApiResponse({ status: 401, description: 'Sai email/password hoặc tài khoản đang bị khoá' })
  @UseGuards(ThrottlerGuard, CsrfGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.auth.login(dto.email, dto.password, req);
    return { ok: true };
  }

  @ApiCookieAuth('sid')
  @ApiOperation({ summary: 'Đăng xuất, xoá session hiện tại' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  @UseGuards(AuthGuard, CsrfGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request): Promise<{ ok: true }> {
    await this.auth.logout(req);
    return { ok: true };
  }

  @ApiCookieAuth('sid')
  @ApiOperation({ summary: 'Lấy thông tin user hiện tại từ session' })
  @ApiResponse({ status: 200, description: 'userId, hasLocalCredential, hasTelegramIdentity, localEmailMasked?' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập / session hết hạn' })
  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.auth.me(userId);
  }
}
