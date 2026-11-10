import { ERROR_HTTP_STATUS, type ErrorCode } from '@tpay/shared/contracts/errors';



export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
  }
}