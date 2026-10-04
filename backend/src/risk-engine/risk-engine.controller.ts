import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../session-store/auth.guard';
import { CsrfGuard } from '../csrf/csrf.guard';
import '../session-store/session.types';
import { RiskEngineService } from './risk-engine.service';
import { CheckPositionRiskDto } from './dto/check-position-risk.dto';
import { ExposureSummaryView, PositionRiskCheckView } from './views';

function userId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

@ApiTags('risk-engine')
@ApiCookieAuth('sid')
@UseGuards(AuthGuard)
@Controller('risk-engine')
export class RiskEngineController {
  constructor(private readonly riskEngine: RiskEngineService) {}

  @ApiOperation({
    summary:
      'R1: tổng initial exposure của mọi Borrow Position OPEN so với cap (collateral/3) — cảnh báo thông tin, không chặn hành động',
  })
  @Get('exposure-summary')
  getExposureSummary(@Req() req: Request): Promise<ExposureSummaryView> {
    return this.riskEngine.getExposureSummary(userId(req));
  }

  @ApiOperation({ summary: 'R2: kiểm tra 1 Borrow Position có chạm ngưỡng 2× first_borrow_entry_price (cần CSRF token)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, description: 'Position không tồn tại hoặc không thuộc user hiện tại' })
  @ApiResponse({ status: 422, description: 'currentPrice không hợp lệ (phải > 0)' })
  @UseGuards(CsrfGuard)
  @Post('positions/:id/check')
  checkPositionRisk(
    @Param('id') id: string,
    @Body() dto: CheckPositionRiskDto,
    @Req() req: Request,
  ): Promise<PositionRiskCheckView> {
    return this.riskEngine.checkPositionRisk(userId(req), id, dto);
  }
}
