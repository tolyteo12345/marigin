import { Module } from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { CsrfGuard } from './csrf.guard';
import { CsrfController } from './csrf.controller';

@Module({
  controllers: [CsrfController],
  providers: [CsrfService, CsrfGuard],
  exports: [CsrfService, CsrfGuard],
})
export class CsrfModule {}
