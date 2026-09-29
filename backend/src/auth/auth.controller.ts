import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from '../local-credential/dto/register.dto';
import { LoginDto } from '../local-credential/dto/login.dto';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AuthGuard } from '../session-store/auth.guard';
import '../session-store/session.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @UseGuards(CsrfGuard)
  @Post('register')
  @HttpCode(200)
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.auth.register(dto.email, dto.password, req);
    return { ok: true };
  }

  @UseGuards(CsrfGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<{ ok: true }> {
    await this.auth.login(dto.email, dto.password, req);
    return { ok: true };
  }

  @UseGuards(AuthGuard, CsrfGuard)
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request): Promise<{ ok: true }> {
    await this.auth.logout(req);
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const userId = (req as Request & { user: { id: string } }).user.id;
    return this.auth.me(userId);
  }
}
