import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../session-store/auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';
import '../session-store/session.types';
import { LedgerService, AvailableCapitalView, ReconcileResult } from './ledger.service';
import { CreateBorrowPositionDto } from './dto/create-borrow-position.dto';
import { SellAssetDto } from './dto/sell-asset.dto';
import { CreateAllocationLotDto } from './dto/create-allocation-lot.dto';
import { SellLotDto } from './dto/sell-lot.dto';
import { RepayDto } from './dto/repay.dto';
import { CorrectionDto } from './dto/correction.dto';
import { UpdatePersonalCapitalDto } from './dto/update-personal-capital.dto';
import { AllocationLotView, BorrowPositionView, LedgerEventView } from './views';

function userId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

// COND-002: every mutating request must carry a client-generated Idempotency-Key.
function idempotencyKey(headerValue: string | undefined): string {
  if (!headerValue || headerValue.trim().length === 0) {
    throw new BadRequestException('Thiếu header Idempotency-Key.');
  }
  return headerValue.trim();
}

@ApiTags('ledger')
@ApiCookieAuth('sid')
@UseGuards(AuthGuard)
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @ApiOperation({ summary: 'Ghi nhận khoản vay mới (cần CSRF token + Idempotency-Key)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 201, description: 'Borrow Position OPEN' })
  @ApiResponse({ status: 409, description: 'Đã có Borrow Position OPEN cùng borrowedAsset (BR-002)' })
  @UseGuards(CsrfGuard)
  @Post('borrow-positions')
  createBorrowPosition(
    @Body() dto: CreateBorrowPositionDto,
    @Req() req: Request,
    @Headers('idempotency-key') key: string,
  ): Promise<BorrowPositionView> {
    return this.ledger.createBorrowPosition(userId(req), dto, idempotencyKey(key));
  }

  @ApiOperation({ summary: 'Danh sách Borrow Position của user hiện tại' })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'REPAID', 'DRIFT_DETECTED'] })
  @Get('borrow-positions')
  listBorrowPositions(@Req() req: Request, @Query('status') status?: string): Promise<BorrowPositionView[]> {
    return this.ledger.listBorrowPositions(userId(req), status);
  }

  @ApiOperation({ summary: 'Chi tiết 1 Borrow Position (ownership-scoped)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, description: 'Không tồn tại hoặc không thuộc user hiện tại' })
  @Get('borrow-positions/:id')
  getBorrowPosition(@Param('id') id: string, @Req() req: Request): Promise<BorrowPositionView> {
    return this.ledger.getBorrowPosition(userId(req), id);
  }

  @ApiOperation({ summary: 'Ghi nhận bán tài sản vay lấy USDT (cần CSRF token + Idempotency-Key)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiParam({ name: 'id' })
  @UseGuards(CsrfGuard)
  @Post('borrow-positions/:id/sell-asset')
  sellAsset(
    @Param('id') id: string,
    @Body() dto: SellAssetDto,
    @Req() req: Request,
    @Headers('idempotency-key') key: string,
  ): Promise<BorrowPositionView> {
    return this.ledger.sellAsset(userId(req), id, dto, idempotencyKey(key));
  }

  @ApiOperation({ summary: 'Ghi nhận trả nợ (cần CSRF token + Idempotency-Key)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 422, description: 'Số tiền trả vượt quá liability hiện tại (overpayment, OQ-P05 — dùng Correction)' })
  @ApiResponse({ status: 409, description: 'Position đang DRIFT_DETECTED hoặc đã REPAID' })
  @UseGuards(CsrfGuard)
  @Post('borrow-positions/:id/repay')
  repay(
    @Param('id') id: string,
    @Body() dto: RepayDto,
    @Req() req: Request,
    @Headers('idempotency-key') key: string,
  ): Promise<BorrowPositionView> {
    return this.ledger.repay(userId(req), id, dto, idempotencyKey(key));
  }

  @ApiOperation({ summary: 'Đối chiếu liability với Binance read-only (cần CSRF token)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'MATCHED | DRIFT_DETECTED | RECONCILE_UNKNOWN (timeout/lỗi, trạng thái không đổi)' })
  @UseGuards(CsrfGuard)
  @Post('borrow-positions/:id/reconcile')
  reconcile(@Param('id') id: string, @Req() req: Request): Promise<ReconcileResult> {
    return this.ledger.reconcile(userId(req), id);
  }

  @ApiOperation({ summary: 'Ghi nhận mua BTC/ETH (tạo Allocation Lot) (cần CSRF token + Idempotency-Key)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 422, description: 'Thiếu fundingBorrowPositionId khi fundingSource=BORROW, hoặc mixed-source (BR-003/AC-004)' })
  @UseGuards(CsrfGuard)
  @Post('allocation-lots')
  createAllocationLot(
    @Body() dto: CreateAllocationLotDto,
    @Req() req: Request,
    @Headers('idempotency-key') key: string,
  ): Promise<AllocationLotView> {
    return this.ledger.createAllocationLot(userId(req), dto, idempotencyKey(key));
  }

  @ApiOperation({ summary: 'Danh sách Allocation Lot của user hiện tại' })
  @ApiQuery({ name: 'fundingBorrowPositionId', required: false })
  @Get('allocation-lots')
  listAllocationLots(@Req() req: Request, @Query('fundingBorrowPositionId') fundingBorrowPositionId?: string): Promise<AllocationLotView[]> {
    return this.ledger.listAllocationLots(userId(req), fundingBorrowPositionId);
  }

  @ApiOperation({ summary: 'Ghi nhận bán một phần/toàn bộ Allocation Lot (cần CSRF token + Idempotency-Key)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 422, description: 'quantitySold vượt quá remainingQuantity' })
  @UseGuards(CsrfGuard)
  @Post('allocation-lots/:id/sell')
  sellLot(
    @Param('id') id: string,
    @Body() dto: SellLotDto,
    @Req() req: Request,
    @Headers('idempotency-key') key: string,
  ): Promise<AllocationLotView> {
    return this.ledger.sellLot(userId(req), id, dto, idempotencyKey(key));
  }

  @ApiOperation({ summary: 'Tạo correction event điều chỉnh 1 event trước đó (cần CSRF token + Idempotency-Key)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiParam({ name: 'id', description: 'id của LedgerEvent gốc cần điều chỉnh' })
  @UseGuards(CsrfGuard)
  @Post('events/:id/correct')
  correct(
    @Param('id') id: string,
    @Body() dto: CorrectionDto,
    @Req() req: Request,
    @Headers('idempotency-key') key: string,
  ): Promise<LedgerEventView> {
    return this.ledger.correct(userId(req), id, dto, idempotencyKey(key));
  }

  @ApiOperation({ summary: 'Lịch sử event (append-only), lọc theo borrowPositionId hoặc allocationLotId' })
  @ApiQuery({ name: 'borrowPositionId', required: false })
  @ApiQuery({ name: 'allocationLotId', required: false })
  @Get('events')
  listEvents(
    @Req() req: Request,
    @Query('borrowPositionId') borrowPositionId?: string,
    @Query('allocationLotId') allocationLotId?: string,
  ): Promise<LedgerEventView[]> {
    return this.ledger.listEvents(userId(req), { borrowPositionId, allocationLotId });
  }

  @ApiOperation({ summary: 'Vốn khả dụng hiện tại (không cache)' })
  @Get('available-capital')
  getAvailableCapital(@Req() req: Request): Promise<AvailableCapitalView> {
    return this.ledger.getAvailableCapital(userId(req));
  }

  @ApiOperation({ summary: 'Cập nhật vốn cá nhân tự khai báo (cần CSRF token) — không suy từ balance Binance' })
  @UseGuards(CsrfGuard)
  @Put('personal-capital')
  updatePersonalCapital(@Body() dto: UpdatePersonalCapitalDto, @Req() req: Request): Promise<{ personalCapitalUsdt: string }> {
    return this.ledger.updatePersonalCapital(userId(req), dto);
  }
}
