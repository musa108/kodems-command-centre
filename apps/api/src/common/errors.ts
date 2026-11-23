import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, PipeTransform } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/** Uniform error body: { error: { code, message, details?, requestId } } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('Http');
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();
    let status = HttpStatus.INTERNAL_SERVER_ERROR, code = 'INTERNAL_ERROR', message = 'Unexpected server error', details: any;
    if (e instanceof HttpException) {
      status = e.getStatus();
      const r: any = e.getResponse();
      message = typeof r === 'string' ? r : r.message ?? e.message;
      code = (typeof r === 'object' && r.code) || HttpStatus[status] || 'ERROR';
      details = typeof r === 'object' ? r.details : undefined;
      if (Array.isArray(message)) message = message.join('; ');
    } else if (e?.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'Duplicate value violates a unique constraint'; }
    else if (e?.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
    else { this.log.error(`${req.method} ${req.url} → ${e?.stack || e}`); }
    res.status(status).json({ error: { code, message, details, requestId: req.id } });
  }
}

export class ZodPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}
  transform(value: unknown) {
    const r = this.schema.safeParse(value);
    if (!r.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Validation failed', details: (r.error as ZodError).flatten() });
    return r.data;
  }
}
export const body = (s: ZodSchema) => new ZodPipe(s);

export class DomainError extends HttpException {
  constructor(code: string, message: string, status = 422) { super({ code, message }, status); }
}
export class ConflictVersion extends HttpException {
  constructor() { super({ code: 'VERSION_CONFLICT', message: 'Record was modified by someone else. Reload and retry.' }, 409); }
}
