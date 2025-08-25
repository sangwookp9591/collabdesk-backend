import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '데이터베이스 처리 중 오가 발생했습니다.';

    switch (exception.code) {
      case 'P2002': // Unique constraint failed
        status = HttpStatus.CONFLICT;
        message = `이미 존재하는 값입니다. (필드: ${exception?.meta?.target as any})`;
        break;

      case 'P2025': // Record not found
        status = HttpStatus.NOT_FOUND;
        message = '요청한 리소스를 찾을 수 없습니다.';
        break;

      case 'P2003': // Foreign key constraint failed
        status = HttpStatus.BAD_REQUEST;
        message = '참조 무결성 제약 조건 오류입니다.';
        break;

      default:
        console.error('Unhandled Prisma error:', exception);
        break;
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
