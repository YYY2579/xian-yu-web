import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { createPrismaClient, MonitorRepository } from '@xianyu/database';
import { JWT_SECRET_TOKEN, requireJwtSecret } from '../auth/tokens';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MonitorsController],
  providers: [
    { provide: JWT_SECRET_TOKEN, useFactory: requireJwtSecret },
    MonitorsService,
    {
      provide: MonitorRepository,
      useFactory: () => new MonitorRepository(createPrismaClient(process.env.DATABASE_URL ?? '')),
    },
  ],
})
export class MonitorsModule {}
