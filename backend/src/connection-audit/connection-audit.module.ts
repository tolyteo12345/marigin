import { Module } from '@nestjs/common';
import { ConnectionAuditService } from './connection-audit.service';

@Module({
  providers: [ConnectionAuditService],
  exports: [ConnectionAuditService],
})
export class ConnectionAuditModule {}
