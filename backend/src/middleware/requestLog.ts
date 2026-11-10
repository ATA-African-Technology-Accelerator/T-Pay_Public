import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logEvent, runWithRequestId } from '../logging/logger';




// A caller may send its own ID, for example the app's sync attempt, so both
// sides can be matched. Anything unusual is replaced, so logs stay clean.
const CALLER_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;


export function requestLog(request: Request, response: Response, next: NextFunction): void {
  const offered = request.get('X-Request-Id');
  const requestId = offered && CALLER_REQUEST_ID.test(offered) ? offered : randomUUID();
  const started = process.hrtime.bigint();
  response.setHeader('X-Request-Id', requestId);

  response.on('finish', () => {
    runWithRequestId(requestId, () => logEvent('http.request', {
      method: request.method,
      // The path only: query strings and bodies can carry personal data.
      path: request.originalUrl.split('?')[0],
      status: response.statusCode,
      durationMs: Number((process.hrtime.bigint() - started) / 1_000_000n),
      deviceId: (response.locals.device as { id?: string } | undefined)?.id ?? null,
    }));
  });

  runWithRequestId(requestId, next);
}
