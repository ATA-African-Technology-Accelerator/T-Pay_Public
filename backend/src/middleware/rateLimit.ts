import type { NextFunction, Request, RequestHandler, Response } from 'express';




export interface RateLimitOptions {
  /** Requests allowed per window from one address. */
  max: number;
  windowMs: number;
  now?: () => number;
}


// A small fixed-window limiter, kept in memory. It guards the public pay page, where every
// submit makes a PayPal order. One server process is enough for that; a second instance would
// need a shared store, and Render's free plan runs one.
export function rateLimit({ max, windowMs, now = Date.now }: RateLimitOptions): RequestHandler {
  const windows = new Map<string, { count: number; resetsAt: number }>();

  return (request: Request, response: Response, next: NextFunction) => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [key, window] of windows) if (window.resetsAt <= at) windows.delete(key);
    }
    const key = request.ip ?? 'unknown';
    const current = windows.get(key);
    const window = current && current.resetsAt > at ? current : { count: 0, resetsAt: at + windowMs };
    window.count += 1;
    windows.set(key, window);

    if (window.count > max) {
      response.setHeader('Retry-After', String(Math.ceil((window.resetsAt - at) / 1000)));
      response.status(429).type('text/plain').send('Too many tries. Wait a minute and try again.');
      return;
    }
    next();
  };
}
