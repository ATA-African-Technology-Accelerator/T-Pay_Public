import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@tpay/shared/contracts/errors';
import { ERROR_HTTP_STATUS, type ErrorCode } from '@tpay/shared/contracts/errors';
import { ApiError } from '../services/ApiError';



function sendError(response: Response, code: ErrorCode, message: string): void {
  const body: ApiErrorBody = { error: { code, message } };
  response.status(ERROR_HTTP_STATUS[code]).json(body);
}

export function notFound(_request: Request, response: Response): void {
  sendError(response, 'ROUTE_NOT_FOUND', 'This route does not exist');
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    sendError(response, error.code, error.message);
    return;
  }
  if (error instanceof SyntaxError) {
    sendError(response, 'VALIDATION_FAILED', 'The request body is not valid JSON');
    return;
  }
  console.error(error);
  sendError(response, 'INTERNAL_SERVER_ERROR', 'Something went wrong');
}