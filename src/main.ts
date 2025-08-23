// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS 설정 (Next.js와 통신용)
  app.enableCors({
    origin: 'http://localhost:3000', // Next.js 개발 서버
    credentials: true,
  });

  // 유효성 검사 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //클라이언트가 { name: 'John', role: 'admin' } 을 보내도, role은 제거됨.
      forbidNonWhitelisted: true, //DTO에 정의되지 않은 속성이 있으면 에러 발생
      transform: true, //클라이언트에서 문자열로 보내도 DTO에 정의된 타입으로 변환됨
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(4000);
  console.log('🚀 NestJS server running on http://localhost:4000');
}
bootstrap();
