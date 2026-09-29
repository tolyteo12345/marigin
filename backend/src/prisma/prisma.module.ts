import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global module: every other module needs PrismaService, avoid re-importing everywhere.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
