import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SessionMiddleware } from './session.middleware';
import { AuthGuard } from './auth.guard';

@Module({
  providers: [SessionMiddleware, AuthGuard],
  exports: [SessionMiddleware, AuthGuard],
})
export class SessionStoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
