import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../session-store/auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';
import { AccountSnapshot, BinanceConnectionService } from './binance-connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ConnectionView, toConnectionView } from './connection-view';
import '../session-store/session.types';

function userId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

@ApiTags('binance-connections')
@ApiCookieAuth('sid')
@UseGuards(AuthGuard)
@Controller('binance-connections')
export class BinanceConnectionController {
  constructor(private readonly connections: BinanceConnectionService) {}

  @ApiOperation({ summary: 'Thêm Binance API key connection, verify ngay đồng bộ (cần CSRF token)' })
  @ApiResponse({ status: 201, description: 'Connection tạo + verify xong (status tuỳ kết quả verify), không trả secret' })
  @UseGuards(CsrfGuard)
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateConnectionDto, @Req() req: Request): Promise<ConnectionView> {
    return this.connections.create(userId(req), dto);
  }

  @ApiOperation({ summary: 'Danh sách connection của user hiện tại (không gồm đã revoke)' })
  @ApiResponse({ status: 200, description: 'Danh sách metadata, không có secret' })
  @Get()
  list(@Req() req: Request): Promise<ConnectionView[]> {
    return this.connections.list(userId(req));
  }

  @ApiOperation({ summary: 'Chi tiết 1 connection (ownership-scoped)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Metadata connection' })
  @ApiResponse({ status: 404, description: 'Không tồn tại hoặc không thuộc user hiện tại (không phân biệt, chống IDOR)' })
  @Get(':id')
  getOne(@Param('id') id: string, @Req() req: Request): Promise<ConnectionView> {
    return this.connections.getOne(userId(req), id);
  }

  @ApiOperation({ summary: 'Xác minh lại connection on-demand (cần CSRF token)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Connection sau verify' })
  @ApiResponse({ status: 404, description: 'Không tồn tại hoặc không thuộc user hiện tại' })
  @UseGuards(CsrfGuard)
  @Post(':id/verify')
  @HttpCode(200)
  async verify(@Param('id') id: string, @Req() req: Request): Promise<ConnectionView> {
    const connection = await this.connections.verify(userId(req), id);
    return toConnectionView(connection);
  }

  @ApiOperation({ summary: 'Đọc snapshot margin account tươi từ Binance (không cache), chỉ khi status=VERIFIED' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'userAssets + fetchedAt (ISO-8601 UTC)' })
  @ApiResponse({ status: 401, description: 'Connection không còn hợp lệ (key bị revoke/đổi permission trên Binance)' })
  @ApiResponse({ status: 429, description: 'Binance rate limit, kèm retryAfterSeconds' })
  @ApiResponse({ status: 503, description: 'Timeout/mất kết nối tới Binance' })
  @Get(':id/account-snapshot')
  getAccountSnapshot(@Param('id') id: string, @Req() req: Request): Promise<AccountSnapshot> {
    return this.connections.getAccountSnapshot(userId(req), id);
  }

  @ApiOperation({ summary: 'Xoá (revoke) connection — null hoá secret ngay, chỉ xoá khỏi hệ thống (cần CSRF token)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Đã revoke' })
  @ApiResponse({ status: 404, description: 'Không tồn tại hoặc không thuộc user hiện tại' })
  @UseGuards(CsrfGuard)
  @Delete(':id')
  @HttpCode(200)
  async revoke(@Param('id') id: string, @Req() req: Request): Promise<{ ok: true }> {
    await this.connections.revoke(userId(req), id);
    return { ok: true };
  }
}
