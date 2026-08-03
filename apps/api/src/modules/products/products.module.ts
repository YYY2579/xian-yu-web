import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import {
  createPrismaClient,
  NotificationRepository,
  PriceHistoryRepository,
  ProductRepository,
} from '@xianyu/database';
import { JWT_SECRET_TOKEN, requireJwtSecret } from '../auth/tokens';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ProductsController],
  providers: [
    { provide: JWT_SECRET_TOKEN, useFactory: requireJwtSecret },
    ProductsService,
    {
      provide: ProductRepository,
      useFactory: () => new ProductRepository(createPrismaClient(process.env.DATABASE_URL ?? '')),
    },
    {
      provide: PriceHistoryRepository,
      useFactory: () =>
        new PriceHistoryRepository(createPrismaClient(process.env.DATABASE_URL ?? '')),
    },
    {
      provide: NotificationRepository,
      useFactory: () =>
        new NotificationRepository(createPrismaClient(process.env.DATABASE_URL ?? '')),
    },
  ],
})
export class ProductsModule {}
