import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type RequestWithId = Request & { requestId?: string };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // 4xx — devolver el mensaje original tal cual
    if (isHttp) {
      const body = exception.getResponse();
      return response
        .status(status)
        .json(typeof body === 'object' ? body : { message: body });
    }

    // 5xx — loguear internamente, nunca exponer detalles al cliente
    const requestId = request.requestId ?? '-';
    this.logger.error(
      `[${requestId}] [${request.method}] ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      statusCode: status,
      message: 'Error interno del servidor.',
    });
  }
}
