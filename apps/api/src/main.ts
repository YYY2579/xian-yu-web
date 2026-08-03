import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@xianyu/config';
import { AppModule } from './app.module';

/**
 * API 入口（API-001）
 * - 全局前缀 /api、CORS 白名单、全局 DTO 校验、请求 ID 拦截器。
 * - OpenAPI 文档 /api/docs（Swagger UI）。
 */

const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: CORS_ORIGINS });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('闲鱼低价商品监控系统 API')
      .setDescription('关键词监控、低价识别与通知')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.PORT);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${config.PORT}/api`);
}

void bootstrap();
